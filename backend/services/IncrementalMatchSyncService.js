const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const MapGameTimeline = require('../models/MapGameTimeline');
const Config = require('../models/Config');
const Team = require('../models/Team');
const TeamAlias = require('../models/TeamAlias');
const Season = require('../models/Season');
const MapModel = require('../models/Map');
const Player = require('../models/Player');
const Hero = require('../models/Hero');
const { createExternalMatchSyncClient } = require('./ExternalMatchSyncClient');
const { createExternalMatchInboxService } = require('./ExternalMatchInboxService');
const {
  aggregateTimeline,
  buildTimelineMirrorAttributes,
  clearTimelineDerivedPlayerData
} = require('./TimelineHeroAggregationService');
const { normalizeTeamIdentity, buildTeamIdentityMap } = require('./TeamAliasService');
const {
  SOURCE_TYPES,
  activateSeasonTeamSource,
  activateSeasonTeamPlayerSource,
  ensureSeasonTeam: ensureSeasonTeamWithSource,
  ensureSeasonTeamPlayer: ensureSeasonTeamPlayerWithSource,
  deactivateMatchSources,
  reconcileMemberships,
  reconcileOrphanPlayers
} = require('./MembershipSourceService');

const SYNC_CURSOR_CONFIG_KEY = 'external_match_sync_cursor_v2';
const SYNC_SUMMARY_CONFIG_KEY = 'latest_match_sync_updates';
const DEFAULT_PAGE_SIZE = 50;
const DETAIL_CONCURRENCY = 5;
const HERO_NAME_ALIASES = {
  dmon: 'd.mon',
  dva: 'd.va'
};

const lower = value => String(value || '').toLowerCase();
const heroNameKey = value => HERO_NAME_ALIASES[lower(value)] || lower(value);
const integer = value => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
const numberOrNull = value => Number.isFinite(Number(value)) ? Number(value) : null;
const normalizeRole = role => role === 'T' ? 'tank' : role === 'D' ? 'damage' : role === 'S' ? 'support' : lower(role);

const parseDuration = value => {
  if (!value || typeof value !== 'string') return 0;
  const [minutes, seconds] = value.split(':').map(Number);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0;
  return minutes + seconds / 60;
};

const parseKad = value => {
  const parts = String(value || '').split('/').map(integer);
  return { kills: parts[0] || 0, assists: parts[1] || 0, deaths: parts[2] || 0 };
};

const mapWithConcurrency = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

const buildCaches = async (transaction) => {
  const [seasons, teams, teamAliases, maps, players, heroes] = await Promise.all([
    Season.findAll({ transaction }),
    Team.findAll({ transaction }),
    TeamAlias.findAll({ transaction }),
    MapModel.findAll({ transaction }),
    Player.findAll({ transaction }),
    Hero.findAll({ transaction })
  ]);
  return {
    seasons,
    teams,
    teamAliases,
    maps,
    players,
    heroes,
    seasonByName: new Map(seasons.flatMap(s => [s.name, s.externalEventName].filter(Boolean).map(name => [lower(name), s]))),
    teamByName: buildTeamIdentityMap(teams, teamAliases),
    mapByName: new Map(maps.filter(m => m.name).map(m => [lower(m.name), m])),
    heroByName: new Map(heroes.filter(h => h.name).map(h => [heroNameKey(h.name), h])),
    heroByExternalId: new Map(heroes.filter(h => h.externalId).map(h => [heroNameKey(h.externalId), h]))
  };
};

const ensureTeam = async (name, caches, transaction) => {
  if (!name) throw new Error('Match team name is missing');
  let team = caches.teamByName.get(normalizeTeamIdentity(name));
  if (!team) {
    team = await Team.create({ name, region: 'ap' }, { transaction });
    caches.teams.push(team);
    caches.teamByName.set(normalizeTeamIdentity(name), team);
  }
  return team;
};

const ensurePlayer = async (source, team, caches, transaction) => {
  if (!source?.name) throw new Error('Player name is missing');
  const role = normalizeRole(source.role);
  const externalId = String(source.playerId || source.name).trim();
  let player = caches.players.find(p => lower(p.externalId) === lower(externalId));
  player ||= caches.players.find(p => (
    !String(p.externalId || '').trim()
    && lower(p.name) === lower(source.name)
    && p.role === role
  ));
  if (!player) {
    player = await Player.create({
      name: source.name,
      externalId,
      role,
      identityOrigin: SOURCE_TYPES.MATCH,
      orphanedAt: null
    }, { transaction });
    caches.players.push(player);
  } else {
    const updates = {};
    if (!player.externalId) updates.externalId = externalId;
    if (player.orphanedAt) updates.orphanedAt = null;
    if (Object.keys(updates).length) await player.update(updates, { transaction });
  }
  return player;
};

const ensureHero = async (name, role, caches, transaction, externalId = null) => {
  if (!name) return null;
  let hero = externalId ? caches.heroByExternalId.get(heroNameKey(externalId)) : null;
  hero ||= caches.heroByName.get(heroNameKey(name));
  if (!hero && ['tank', 'damage', 'support'].includes(role)) {
    hero = await Hero.create({ name, externalId: externalId || null, role, subRole: null }, { transaction });
    caches.heroes.push(hero);
    caches.heroByName.set(heroNameKey(name), hero);
    if (externalId) caches.heroByExternalId.set(heroNameKey(externalId), hero);
  } else if (hero && externalId && !hero.externalId) {
    await hero.update({ externalId }, { transaction });
    caches.heroByExternalId.set(heroNameKey(externalId), hero);
  }
  return hero || null;
};

const resolveMap = (name, caches) => {
  const aliases = { '直布罗陀': '监测站：直布罗陀' };
  return caches.mapByName.get(lower(aliases[name] || name));
};

// 同步比赛时自动维护 赛季-队伍 关联（有比赛即视为该队参加了该赛季）
const ensureSeasonTeam = async (season, team, sourceKey, caches, transaction) => {
  if (!caches.seasonTeamByKey) caches.seasonTeamByKey = new Map();
  const key = `${season.id}:${team.id}`;
  let seasonTeam = caches.seasonTeamByKey.get(key);
  if (!seasonTeam) {
    const result = await ensureSeasonTeamWithSource({
      seasonId: season.id,
      teamId: team.id,
      sourceType: SOURCE_TYPES.MATCH,
      sourceKey,
      transaction
    });
    seasonTeam = result.seasonTeam;
    caches.seasonTeamByKey.set(key, seasonTeam);
    return { seasonTeam, relationCreated: result.relationCreated, sourceCreated: result.sourceCreated };
  }
  const sourceResult = await activateSeasonTeamSource(
    seasonTeam.id,
    SOURCE_TYPES.MATCH,
    sourceKey,
    transaction
  );
  return { seasonTeam, relationCreated: false, sourceCreated: sourceResult.created };
};

// 同步比赛时自动维护 赛季-队伍-选手 关联（登场即视为该赛季效力于该队）
const ensureSeasonTeamPlayer = async (seasonTeam, player, sourceKey, caches, transaction) => {
  if (!caches.seasonTeamPlayerByKey) caches.seasonTeamPlayerByKey = new Map();
  const key = `${seasonTeam.id}:${player.id}`;
  let seasonTeamPlayer = caches.seasonTeamPlayerByKey.get(key);
  if (!seasonTeamPlayer) {
    const result = await ensureSeasonTeamPlayerWithSource({
      seasonTeam,
      playerId: player.id,
      sourceType: SOURCE_TYPES.MATCH,
      sourceKey,
      transaction
    });
    seasonTeamPlayer = result.seasonTeamPlayer;
    caches.seasonTeamPlayerByKey.set(key, seasonTeamPlayer);
    return {
      seasonTeamPlayer,
      relationCreated: result.relationCreated,
      sourceCreated: result.sourceCreated
    };
  }
  const sourceResult = await activateSeasonTeamPlayerSource(
    seasonTeamPlayer.id,
    SOURCE_TYPES.MATCH,
    sourceKey,
    transaction
  );
  return { seasonTeamPlayer, relationCreated: false, sourceCreated: sourceResult.created };
};

const deleteMatchByExternalId = async (externalId, transaction) => {
  const touchedMemberships = await deactivateMatchSources(externalId, transaction);
  const match = await Match.findOne({ where: { externalId: String(externalId) }, transaction });
  if (!match) return { deleted: false, seasonId: null, touchedMemberships };
  const mapGames = await MapGame.findAll({ where: { matchId: match.id }, attributes: ['id'], transaction });
  const mapGameIds = mapGames.map(game => game.id);
  if (mapGameIds.length) {
    await MapGameTimeline.destroy({ where: { mapGameId: { [Op.in]: mapGameIds } }, transaction });
    const playerStats = await PlayerStat.findAll({ where: { mapGameId: { [Op.in]: mapGameIds } }, attributes: ['id'], transaction });
    const playerStatIds = playerStats.map(stat => stat.id);
    if (playerStatIds.length) await PlayerHeroStat.destroy({ where: { playerStatId: { [Op.in]: playerStatIds } }, transaction });
    await PlayerStat.destroy({ where: { mapGameId: { [Op.in]: mapGameIds } }, transaction });
    await MapGame.destroy({ where: { id: { [Op.in]: mapGameIds } }, transaction });
  }
  await match.destroy({ transaction });
  return { deleted: true, seasonId: match.seasonId, touchedMemberships };
};

const replacePlayerStats = async ({
  mapGame,
  round,
  team1,
  team2,
  seasonTeam1,
  seasonTeam2,
  sourceKey,
  caches,
  transaction
}) => {
  const existing = await PlayerStat.findAll({ where: { mapGameId: mapGame.id }, attributes: ['id'], transaction });
  const existingIds = existing.map(stat => stat.id);
  if (existingIds.length) await PlayerHeroStat.destroy({ where: { playerStatId: { [Op.in]: existingIds } }, transaction });
  await PlayerStat.destroy({ where: { mapGameId: mapGame.id }, transaction });

  const pendingHeroStats = [];
  let playerStatsCount = 0;
  let heroStatsCount = 0;
  let newMembershipsCount = 0;
  for (const [players, team, seasonTeam] of [[round.playersA || [], team1, seasonTeam1], [round.playersB || [], team2, seasonTeam2]]) {
    for (const source of players) {
      const player = await ensurePlayer(source, team, caches, transaction);
      if (seasonTeam) {
        const membership = await ensureSeasonTeamPlayer(
          seasonTeam,
          player,
          sourceKey,
          caches,
          transaction
        );
        if (membership.relationCreated) newMembershipsCount++;
      }
      const role = normalizeRole(source.role);
      const heroes = Array.isArray(source.heroes) ? source.heroes : [];
      const heroModels = [];
      for (const detail of heroes) {
        heroModels.push(await ensureHero(
          detail.hero,
          role,
          caches,
          transaction,
          detail.heroId || detail.heroExternalId || null
        ));
      }
      const { kills, assists, deaths } = parseKad(source.kad);
      const finalBlows = source.finalBlows ?? heroes.reduce((sum, hero) => sum + integer(hero.finalBlows), 0);
      const ultsUsed = heroes.reduce((sum, hero) => sum + integer(hero.ultUsed), 0);
      const playerStat = await PlayerStat.create({
        mapGameId: mapGame.id,
        playerId: player.id,
        heroId: heroes.length === 1 ? heroModels[0]?.id || null : null,
        teamId: team.id,
        kills,
        assists,
        deaths,
        damage: integer(source.damage),
        healing: integer(source.healing),
        mitigation: integer(source.blocked),
        finalBlows: integer(finalBlows),
        ultsUsed
      }, { transaction });
      playerStatsCount++;

      heroes.forEach((detail, index) => {
        if (!detail.hero) return;
        pendingHeroStats.push({
          playerStatId: playerStat.id,
          heroId: heroModels[index]?.id || null,
          heroName: detail.hero,
          heroExternalId: detail.heroId || detail.heroExternalId || null,
          usageSeconds: integer(detail.usageSeconds),
          usagePercentage: Number(detail.usagePercentage) || 0,
          finalBlows: integer(detail.finalBlows),
          deathsByFinalBlow: integer(detail.deathsByFinalBlow),
          ultReady: integer(detail.ultReady),
          ultUsed: integer(detail.ultUsed),
          avgUltChargeSeconds: numberOrNull(detail.avgUltChargeSeconds)
        });
      });
    }
  }
  if (pendingHeroStats.length) {
    await PlayerHeroStat.bulkCreate(pendingHeroStats, { transaction });
    heroStatsCount = pendingHeroStats.length;
  }
  return { playerStatsCount, heroStatsCount, newMembershipsCount };
};

const upsertMatchDetail = async (source, caches, transaction) => {
  const eventName = source.eventName;
  const season = caches.seasonByName.get(lower(eventName));
  if (!season) throw new Error(`Season not found for eventName: ${eventName}`);
  if (!source.teamA?.name || !source.teamB?.name) throw new Error(`Match ${source.id} is missing team data`);

  const touchedMemberships = await deactivateMatchSources(source.id, transaction);

  const team1 = await ensureTeam(source.teamA.name, caches, transaction);
  const team2 = await ensureTeam(source.teamB.name, caches, transaction);
  const seasonTeamResult1 = await ensureSeasonTeam(season, team1, source.id, caches, transaction);
  const seasonTeamResult2 = await ensureSeasonTeam(season, team2, source.id, caches, transaction);
  const seasonTeam1 = seasonTeamResult1.seasonTeam;
  const seasonTeam2 = seasonTeamResult2.seasonTeam;
  const scoreA = integer(source.scoreA);
  const scoreB = integer(source.scoreB);
  const winnerId = scoreA > scoreB ? team1.id : team2.id;
  const matchDate = source.matchDate || String(source.createdAt || new Date().toISOString()).split('T')[0];
  const payload = {
    seasonId: season.id,
    team1Id: team1.id,
    team2Id: team2.id,
    winnerId,
    matchDate,
    boFormat: source.boFormat,
    team1Score: scoreA,
    team2Score: scoreB
  };
  let match = await Match.findOne({ where: { externalId: String(source.id) }, transaction });
  const created = !match;
  if (match) await match.update(payload, { transaction });
  else match = await Match.create({ externalId: String(source.id), ...payload }, { transaction });

  const keptMapGameIds = [];
  let playerStatsCount = 0;
  let heroStatsCount = 0;
  let newMapGamesCount = 0;
  let updatedMapGamesCount = 0;
  let newPlayerStatsCount = 0;
  let updatedPlayerStatsCount = 0;
  let newMembershipsCount = 0;
  for (const [roundPosition, round] of (source.rounds || []).entries()) {
    const externalRoundIndex = Number.isInteger(round.roundIndex) ? round.roundIndex : roundPosition;
    const map = resolveMap(round.mapName, caches);
    if (!map) throw new Error(`Map not found: ${round.mapName}`);
    const banA = caches.heroByName.get(heroNameKey(round.bans?.teamA)) || null;
    const banB = caches.heroByName.get(heroNameKey(round.bans?.teamB)) || null;
    const roundWinnerId = round.winner === 'A' ? team1.id : round.winner === 'B' ? team2.id : team2.id;
    const mapPayload = {
      seasonId: season.id,
      team1Id: team1.id,
      team2Id: team2.id,
      winnerId: roundWinnerId,
      team1BanHeroId: banA?.id || null,
      team2BanHeroId: banB?.id || null,
      duration: parseDuration(round.duration),
      team1Score: round.roundScoreA,
      team2Score: round.roundScoreB,
      replayId: round.replayId || null,
      statsVersion: integer(round.statsVersion) || (round.timeline ? 3 : 1),
      externalRoundIndex
    };
    let mapGame = await MapGame.findOne({ where: { matchId: match.id, externalRoundIndex }, transaction });
    if (!mapGame) {
      mapGame = await MapGame.findOne({
        where: { matchId: match.id, mapId: map.id, externalRoundIndex: null },
        transaction
      });
    }
    const mapGameCreated = !mapGame;
    if (mapGame) {
      await mapGame.update(mapPayload, { transaction });
      updatedMapGamesCount++;
    } else {
      mapGame = await MapGame.create({ matchId: match.id, mapId: map.id, ...mapPayload }, { transaction });
      newMapGamesCount++;
    }
    keptMapGameIds.push(mapGame.id);
    if (round.timeline) {
      const timelinePayload = buildTimelineMirrorAttributes(round);
      const existingTimeline = await MapGameTimeline.findOne({ where: { mapGameId: mapGame.id }, transaction });
      if (existingTimeline) await existingTimeline.update(timelinePayload, { transaction });
      else await MapGameTimeline.create({ mapGameId: mapGame.id, ...timelinePayload }, { transaction });
    } else {
      await MapGameTimeline.destroy({ where: { mapGameId: mapGame.id }, transaction });
    }
    const aggregated = round.timeline
      ? aggregateTimeline(round.timeline, round)
      : clearTimelineDerivedPlayerData(round);
    const counts = await replacePlayerStats({
      mapGame,
      round: { ...round, ...aggregated },
      team1,
      team2,
      seasonTeam1,
      seasonTeam2,
      sourceKey: source.id,
      caches,
      transaction
    });
    playerStatsCount += counts.playerStatsCount;
    heroStatsCount += counts.heroStatsCount;
    newMembershipsCount += counts.newMembershipsCount;
    if (mapGameCreated) newPlayerStatsCount += counts.playerStatsCount;
    else updatedPlayerStatsCount += counts.playerStatsCount;
  }

  const staleWhere = { matchId: match.id };
  if (keptMapGameIds.length) staleWhere.id = { [Op.notIn]: keptMapGameIds };
  const staleMapGames = await MapGame.findAll({ where: staleWhere, attributes: ['id'], transaction });
  const staleIds = staleMapGames.map(game => game.id);
  if (staleIds.length) {
    await MapGameTimeline.destroy({ where: { mapGameId: { [Op.in]: staleIds } }, transaction });
    const staleStats = await PlayerStat.findAll({ where: { mapGameId: { [Op.in]: staleIds } }, attributes: ['id'], transaction });
    const staleStatIds = staleStats.map(stat => stat.id);
    if (staleStatIds.length) await PlayerHeroStat.destroy({ where: { playerStatId: { [Op.in]: staleStatIds } }, transaction });
    await PlayerStat.destroy({ where: { mapGameId: { [Op.in]: staleIds } }, transaction });
    await MapGame.destroy({ where: { id: { [Op.in]: staleIds } }, transaction });
  }
  return {
    created,
    seasonId: season.id,
    playerStatsCount,
    heroStatsCount,
    newMapGamesCount,
    updatedMapGamesCount,
    newPlayerStatsCount,
    updatedPlayerStatsCount,
    newSeasonTeamsCount: Number(seasonTeamResult1.relationCreated) + Number(seasonTeamResult2.relationCreated),
    newMembershipsCount,
    touchedMemberships,
    updatedMatch: {
      matchId: match.id,
      externalId: match.externalId,
      seasonId: season.id,
      seasonName: season.name,
      team1Id: team1.id,
      team1Name: team1.name,
      team2Id: team2.id,
      team2Name: team2.name,
      winnerId,
      team1Score: scoreA,
      team2Score: scoreB,
      matchDate,
      boFormat: source.boFormat || '',
      updatedMatch: !created,
      updatedMapGamesCount,
      updatedPlayerStatsCount,
      syncedAt: new Date().toISOString()
    }
  };
};

const persistJsonConfig = async (key, value, description, transaction) => {
  const [config, created] = await Config.findOrCreate({
    where: { key },
    defaults: { value, description },
    transaction
  });
  if (!created) {
    config.value = value;
    config.description = description;
    config.changed('value', true);
    await config.save({ transaction });
  }
};

const applyInboxChange = async (row, detail, transaction) => {
  const result = row.operation === 'delete'
    ? await deleteMatchByExternalId(row.externalId, transaction)
    : await upsertMatchDetail(detail, await buildCaches(transaction), transaction);
  const membershipResult = await reconcileMemberships(result.touchedMemberships, transaction);
  const summary = {...result};
  delete summary.touchedMemberships;
  return {
    ...summary,
    removedSeasonTeamsCount: membershipResult.removedSeasonTeamIds.length,
    removedSeasonTeamPlayersCount: membershipResult.removedSeasonTeamPlayerIds.length
  };
};

const createIncrementalMatchSyncService = ({
  client = createExternalMatchSyncClient(), inbox = createExternalMatchInboxService(),
  applyChange = applyInboxChange,
  saveSummary = totals => sequelize.transaction(transaction => persistJsonConfig(
    SYNC_SUMMARY_CONFIG_KEY, totals, 'Latest external match sync and pending work', transaction)),
  reconcileOrphans = () => sequelize.transaction(transaction => reconcileOrphanPlayers({transaction}))
} = {}) => {
  const prepare = async candidate => {
    try {
      const detail = await client.fetchMatch(candidate.externalId);
      if (typeof detail.updatedAt !== 'string' || !Number.isFinite(Date.parse(detail.updatedAt))) {
        throw new Error('Match detail is missing updatedAt; cannot verify its source version');
      }
      if (detail.updatedAt < candidate.sourceUpdatedAt) throw new Error('Match detail is older than the captured change');
      if (detail.updatedAt > candidate.sourceUpdatedAt) {
        // Detail reads are live; replace an obsolete update/delete with the newer source state.
        const newer = await inbox.enqueueOne({id: candidate.externalId, updatedAt: detail.updatedAt, operation: 'upsert'});
        candidate = newer.get ? newer.get({plain: true}) : {...newer};
        if (candidate.sourceUpdatedAt !== detail.updatedAt) {
          throw new Error('Captured match changed again while reading detail; retrying the newer version');
        }
      }
      if (candidate.operation === 'delete') throw new Error('Deleted match still exists at the source; waiting for a newer change');
      return {candidate, detail};
    } catch (error) {
      if (candidate.operation === 'delete' && error.statusCode === 404) return {candidate, detail: null};
      return {candidate, error};
    }
  };
  const processPrepared = prepared => inbox.apply(prepared.candidate, (row, transaction) => {
    if (prepared.error) throw prepared.error;
    return applyChange(row, prepared.detail, transaction);
  });

  return {
    async syncMatch(externalId, {source = 'targeted'} = {}) {
      const id = String(externalId || '').trim();
      if (!id) throw new Error('External match id is required');
      const detail = await client.fetchMatch(id);
      const row = await inbox.enqueueOne({id, updatedAt: detail.updatedAt, operation: 'upsert'}, true);
      const prepared = await prepare(row.get ? row.get({plain: true}) : {...row});
      const outcome = await processPrepared(prepared);
      if (outcome.error) throw new Error(outcome.error.message);
      return {message: outcome.skipped ? 'Targeted match sync superseded' : 'Targeted match sync completed',
        data: {source, externalId: id, ...outcome.result, skipped: outcome.skipped || false, syncedAt: new Date().toISOString()}};
    },

    async run({source = 'manual', maxPages = 100, maxItems = 200} = {}) {
      const totals = {
        source, pagesProcessed: 0, capturedChangesCount: 0,
        upsertedMatchesCount: 0, deletedMatchesCount: 0,
        playerStatsCount: 0, heroStatsCount: 0, newMatchesCount: 0, updatedMatchesCount: 0,
        newMapGamesCount: 0, updatedMapGamesCount: 0, newPlayerStatsCount: 0, updatedPlayerStatsCount: 0,
        newSeasonTeamsCount: 0, newSeasonTeamPlayersCount: 0,
        removedSeasonTeamsCount: 0, removedSeasonTeamPlayersCount: 0,
        orphanPlayersMarkedCount: 0, orphanPlayersRestoredCount: 0, orphanPlayersDeletedCount: 0,
        protectedOrphanPlayersCount: 0, updatedMatches: [], seasonImportSummary: [], affectedSeasonIds: [],
        errors: [], captureError: null, capturedThrough: null, appliedThrough: null, captureCaughtUp: false
      };
      try {
        for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
          const cursor = await inbox.cursor();
          const page = await client.fetchChanges({cursor, limit: DEFAULT_PAGE_SIZE});
          if ((page.hasMore || page.items.length > 0) && (!page.nextCursor || page.nextCursor === cursor)) {
            throw new Error('External match sync cursor did not advance');
          }
          if (!await inbox.capture(page, cursor)) continue;
          totals.capturedThrough = page.nextCursor ?? cursor;
          totals.pagesProcessed++;
          totals.capturedChangesCount += page.items.length;
          if (!page.hasMore) { totals.captureCaughtUp = true; break; }
        }
      } catch (error) {
        // Previously captured work remains processable when the feed is temporarily unavailable.
        totals.captureError = error.message || String(error);
      }

      const candidates = (await inbox.pending(maxItems)).map(row => row.get ? row.get({plain: true}) : {...row});
      const prepared = await mapWithConcurrency(candidates, DETAIL_CONCURRENCY, prepare);
      for (const item of prepared) {
        const outcome = await processPrepared(item);
        if (outcome.error) { totals.errors.push(outcome.error); continue; }
        if (outcome.skipped) continue;
        const result = outcome.result;
        if (item.candidate.operation === 'delete') {
          if (result.deleted) totals.deletedMatchesCount++;
        } else {
          totals.upsertedMatchesCount++;
          if (result.created) totals.newMatchesCount++; else totals.updatedMatchesCount++;
          for (const key of ['playerStatsCount', 'heroStatsCount', 'newMapGamesCount', 'updatedMapGamesCount',
            'newPlayerStatsCount', 'updatedPlayerStatsCount', 'newSeasonTeamsCount']) totals[key] += result[key] || 0;
          totals.newSeasonTeamPlayersCount += result.newMembershipsCount || 0;
          if (result.updatedMatch) totals.updatedMatches.push(result.updatedMatch);
        }
        totals.removedSeasonTeamsCount += result.removedSeasonTeamsCount || 0;
        totals.removedSeasonTeamPlayersCount += result.removedSeasonTeamPlayersCount || 0;
        if (result.seasonId && !totals.affectedSeasonIds.includes(Number(result.seasonId))) {
          totals.affectedSeasonIds.push(Number(result.seasonId));
        }
      }
      Object.assign(totals, await inbox.summary());
      totals.fullyApplied = totals.captureCaughtUp && totals.pendingCount === 0;
      if (totals.fullyApplied) totals.fullyApplied = await inbox.markApplied(totals.capturedThrough);
      totals.capturedThrough = await inbox.cursor();
      totals.appliedThrough = await inbox.appliedCursor();
      totals.cursor = totals.appliedThrough; // Preserve the old, fully-applied cursor contract.
      if (totals.fullyApplied) {
        const orphanSummary = await reconcileOrphans();
        totals.orphanPlayersMarkedCount = orphanSummary.marked.length;
        totals.orphanPlayersRestoredCount = orphanSummary.restored.length;
        totals.orphanPlayersDeletedCount = orphanSummary.deleted.length;
        totals.protectedOrphanPlayersCount = orphanSummary.protectedLegacyOrManual.length;
      }
      totals.lastSyncAt = new Date().toISOString();
      totals.updatedMatches = totals.updatedMatches.slice(-20);
      await saveSummary(totals);
      return {message: totals.fullyApplied ? 'Incremental match sync completed' : 'Changes captured; pending matches will retry independently', data: totals};
    }
  };
};

module.exports = {
  SYNC_CURSOR_CONFIG_KEY,
  HERO_NAME_ALIASES,
  heroNameKey,
  createIncrementalMatchSyncService,
  parseDuration,
  parseKad,
  mapWithConcurrency
};
