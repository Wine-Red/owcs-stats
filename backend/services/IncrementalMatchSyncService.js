const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const Config = require('../models/Config');
const Team = require('../models/Team');
const Season = require('../models/Season');
const MapModel = require('../models/Map');
const Player = require('../models/Player');
const Hero = require('../models/Hero');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const { createExternalMatchSyncClient } = require('./ExternalMatchSyncClient');

const SYNC_CURSOR_CONFIG_KEY = 'external_match_sync_cursor_v2';
const SYNC_SUMMARY_CONFIG_KEY = 'latest_match_sync_updates';
const DEFAULT_PAGE_SIZE = 50;
const DETAIL_CONCURRENCY = 5;
const HERO_NAME_ALIASES = {
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
  const [seasons, teams, maps, players, heroes] = await Promise.all([
    Season.findAll({ transaction }),
    Team.findAll({ transaction }),
    MapModel.findAll({ transaction }),
    Player.findAll({ transaction }),
    Hero.findAll({ transaction })
  ]);
  return {
    seasons,
    teams,
    maps,
    players,
    heroes,
    seasonByName: new Map(seasons.flatMap(s => [s.name, s.externalEventName].filter(Boolean).map(name => [lower(name), s]))),
    teamByName: new Map(teams.filter(t => t.name).map(t => [lower(t.name), t])),
    mapByName: new Map(maps.filter(m => m.name).map(m => [lower(m.name), m])),
    heroByName: new Map(heroes.filter(h => h.name).map(h => [heroNameKey(h.name), h]))
  };
};

const ensureTeam = async (name, caches, transaction) => {
  if (!name) throw new Error('Match team name is missing');
  let team = caches.teamByName.get(lower(name));
  if (!team) {
    team = await Team.create({ name, region: 'ap' }, { transaction });
    caches.teams.push(team);
    caches.teamByName.set(lower(name), team);
  }
  return team;
};

const ensurePlayer = async (source, team, caches, transaction) => {
  if (!source?.name) throw new Error('Player name is missing');
  const role = normalizeRole(source.role);
  let player = caches.players.find(p => lower(p.name) === lower(source.name) && p.role === role);
  if (!player) {
    player = await Player.create({ name: source.name, teamId: team.id, role }, { transaction });
    caches.players.push(player);
  } else if (player.teamId !== team.id) {
    await player.update({ teamId: team.id }, { transaction });
  }
  return player;
};

const ensureHero = async (name, role, caches, transaction) => {
  if (!name) return null;
  let hero = caches.heroByName.get(heroNameKey(name));
  if (!hero && ['tank', 'damage', 'support'].includes(role)) {
    hero = await Hero.create({ name, role, subRole: null }, { transaction });
    caches.heroes.push(hero);
    caches.heroByName.set(heroNameKey(name), hero);
  }
  return hero || null;
};

const resolveMap = (name, caches) => {
  const aliases = { '直布罗陀': '监测站：直布罗陀' };
  return caches.mapByName.get(lower(aliases[name] || name));
};

// 同步比赛时自动维护 赛季-队伍 关联（有比赛即视为该队参加了该赛季）
const ensureSeasonTeam = async (season, team, caches, transaction) => {
  if (!caches.seasonTeamByKey) caches.seasonTeamByKey = new Map();
  const key = `${season.id}:${team.id}`;
  let seasonTeam = caches.seasonTeamByKey.get(key);
  if (!seasonTeam) {
    [seasonTeam] = await SeasonTeam.findOrCreate({
      where: { seasonId: season.id, teamId: team.id },
      defaults: { seasonId: season.id, teamId: team.id },
      transaction
    });
    caches.seasonTeamByKey.set(key, seasonTeam);
  }
  return seasonTeam;
};

// 同步比赛时自动维护 赛季-队伍-选手 关联（登场即视为该赛季效力于该队）
const ensureSeasonTeamPlayer = async (seasonTeam, player, caches, transaction) => {
  if (!caches.seasonTeamPlayerByKey) caches.seasonTeamPlayerByKey = new Map();
  const key = `${seasonTeam.id}:${player.id}`;
  if (caches.seasonTeamPlayerByKey.has(key)) return;
  await SeasonTeamPlayer.findOrCreate({
    where: { seasonTeamId: seasonTeam.id, playerId: player.id },
    defaults: { seasonTeamId: seasonTeam.id, playerId: player.id },
    transaction
  });
  caches.seasonTeamPlayerByKey.set(key, true);
};

const deleteMatchByExternalId = async (externalId, transaction) => {
  const match = await Match.findOne({ where: { externalId: String(externalId) }, transaction });
  if (!match) return { deleted: false, seasonId: null };
  const mapGames = await MapGame.findAll({ where: { matchId: match.id }, attributes: ['id'], transaction });
  const mapGameIds = mapGames.map(game => game.id);
  if (mapGameIds.length) {
    const playerStats = await PlayerStat.findAll({ where: { mapGameId: { [Op.in]: mapGameIds } }, attributes: ['id'], transaction });
    const playerStatIds = playerStats.map(stat => stat.id);
    if (playerStatIds.length) await PlayerHeroStat.destroy({ where: { playerStatId: { [Op.in]: playerStatIds } }, transaction });
    await PlayerStat.destroy({ where: { mapGameId: { [Op.in]: mapGameIds } }, transaction });
    await MapGame.destroy({ where: { id: { [Op.in]: mapGameIds } }, transaction });
  }
  await match.destroy({ transaction });
  return { deleted: true, seasonId: match.seasonId };
};

const replacePlayerStats = async ({ mapGame, round, team1, team2, seasonTeam1, seasonTeam2, caches, transaction }) => {
  const existing = await PlayerStat.findAll({ where: { mapGameId: mapGame.id }, attributes: ['id'], transaction });
  const existingIds = existing.map(stat => stat.id);
  if (existingIds.length) await PlayerHeroStat.destroy({ where: { playerStatId: { [Op.in]: existingIds } }, transaction });
  await PlayerStat.destroy({ where: { mapGameId: mapGame.id }, transaction });

  const pendingHeroStats = [];
  let playerStatsCount = 0;
  let heroStatsCount = 0;
  for (const [players, team, seasonTeam] of [[round.playersA || [], team1, seasonTeam1], [round.playersB || [], team2, seasonTeam2]]) {
    for (const source of players) {
      const player = await ensurePlayer(source, team, caches, transaction);
      if (seasonTeam) await ensureSeasonTeamPlayer(seasonTeam, player, caches, transaction);
      const role = normalizeRole(source.role);
      const heroes = Array.isArray(source.heroes) ? source.heroes : [];
      const heroModels = [];
      for (const detail of heroes) heroModels.push(await ensureHero(detail.hero, role, caches, transaction));
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
  return { playerStatsCount, heroStatsCount };
};

const upsertMatchDetail = async (source, teamNameMapping, caches, transaction) => {
  const eventName = source.eventName;
  const season = caches.seasonByName.get(lower(eventName));
  if (!season) throw new Error(`Season not found for eventName: ${eventName}`);
  if (!source.teamA?.name || !source.teamB?.name) throw new Error(`Match ${source.id} is missing team data`);

  const team1Name = teamNameMapping[source.teamA.name] || source.teamA.name;
  const team2Name = teamNameMapping[source.teamB.name] || source.teamB.name;
  const team1 = await ensureTeam(team1Name, caches, transaction);
  const team2 = await ensureTeam(team2Name, caches, transaction);
  const seasonTeam1 = await ensureSeasonTeam(season, team1, caches, transaction);
  const seasonTeam2 = await ensureSeasonTeam(season, team2, caches, transaction);
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
  for (const round of source.rounds || []) {
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
      statsVersion: integer(round.statsVersion) || 1
    };
    let mapGame = await MapGame.findOne({ where: { matchId: match.id, mapId: map.id }, transaction });
    const mapGameCreated = !mapGame;
    if (mapGame) {
      await mapGame.update(mapPayload, { transaction });
      updatedMapGamesCount++;
    } else {
      mapGame = await MapGame.create({ matchId: match.id, mapId: map.id, ...mapPayload }, { transaction });
      newMapGamesCount++;
    }
    keptMapGameIds.push(mapGame.id);
    const counts = await replacePlayerStats({ mapGame, round, team1, team2, seasonTeam1, seasonTeam2, caches, transaction });
    playerStatsCount += counts.playerStatsCount;
    heroStatsCount += counts.heroStatsCount;
    if (mapGameCreated) newPlayerStatsCount += counts.playerStatsCount;
    else updatedPlayerStatsCount += counts.playerStatsCount;
  }

  const staleWhere = { matchId: match.id };
  if (keptMapGameIds.length) staleWhere.id = { [Op.notIn]: keptMapGameIds };
  const staleMapGames = await MapGame.findAll({ where: staleWhere, attributes: ['id'], transaction });
  const staleIds = staleMapGames.map(game => game.id);
  if (staleIds.length) {
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

const createIncrementalMatchSyncService = ({ client = createExternalMatchSyncClient() } = {}) => ({
  async run({ source = 'manual', maxPages = Number.POSITIVE_INFINITY } = {}) {
    const cursorConfig = await Config.findByPk(SYNC_CURSOR_CONFIG_KEY);
    let cursor = cursorConfig?.value?.cursor || null;
    const totals = {
      source,
      lastSyncAt: null,
      pagesProcessed: 0,
      upsertedMatchesCount: 0,
      deletedMatchesCount: 0,
      playerStatsCount: 0,
      heroStatsCount: 0,
      newMatchesCount: 0,
      updatedMatchesCount: 0,
      newMapGamesCount: 0,
      updatedMapGamesCount: 0,
      newPlayerStatsCount: 0,
      updatedPlayerStatsCount: 0,
      updatedMatches: [],
      seasonImportSummary: [],
      affectedSeasonIds: [],
      cursor: null,
      errors: []
    };

    do {
      const page = await client.fetchChanges({ cursor, limit: DEFAULT_PAGE_SIZE });
      if (page.hasMore && page.nextCursor === cursor) {
        throw new Error('External match sync cursor did not advance');
      }
      const upserts = page.items.filter(item => item.operation === 'upsert');
      const details = await mapWithConcurrency(upserts, DETAIL_CONCURRENCY, item => client.fetchMatch(item.id));
      const detailsById = new Map(details.map(detail => [String(detail.id), detail]));

      await sequelize.transaction(async transaction => {
        const mappingConfig = await Config.findByPk('team_name_mapping', { transaction });
        const teamNameMapping = mappingConfig?.value || {};
        const caches = await buildCaches(transaction);
        const affectedSeasonIds = new Set();

        for (const item of page.items) {
          if (item.operation === 'delete') {
            const result = await deleteMatchByExternalId(item.id, transaction);
            if (result.deleted) totals.deletedMatchesCount++;
            if (result.seasonId) affectedSeasonIds.add(Number(result.seasonId));
          } else {
            const result = await upsertMatchDetail(detailsById.get(String(item.id)), teamNameMapping, caches, transaction);
            totals.upsertedMatchesCount++;
            if (result.created) totals.newMatchesCount++;
            else totals.updatedMatchesCount++;
            totals.playerStatsCount += result.playerStatsCount;
            totals.heroStatsCount += result.heroStatsCount;
            totals.newMapGamesCount += result.newMapGamesCount;
            totals.updatedMapGamesCount += result.updatedMapGamesCount;
            totals.newPlayerStatsCount += result.newPlayerStatsCount;
            totals.updatedPlayerStatsCount += result.updatedPlayerStatsCount;
            if (!result.created) totals.updatedMatches.push(result.updatedMatch);
            affectedSeasonIds.add(Number(result.seasonId));
          }
        }

        // 赛季聚合统计改为读取接口实时计算，同步后不再重写预聚合表
        const nextCursor = page.nextCursor ?? cursor;
        await persistJsonConfig(SYNC_CURSOR_CONFIG_KEY, {
          schemaVersion: page.schemaVersion,
          cursor: nextCursor,
          generatedAt: page.generatedAt,
          savedAt: new Date().toISOString()
        }, 'External match incremental sync cursor', transaction);
        affectedSeasonIds.forEach(id => {
          if (!totals.affectedSeasonIds.includes(id)) totals.affectedSeasonIds.push(id);
        });
        cursor = nextCursor;
      });

      totals.pagesProcessed++;
      if (!page.hasMore) break;
    } while (totals.pagesProcessed < maxPages);

    totals.lastSyncAt = new Date().toISOString();
    totals.cursor = cursor;
    totals.updatedMatches = totals.updatedMatches.slice(-20);
    await sequelize.transaction(transaction => persistJsonConfig(
      SYNC_SUMMARY_CONFIG_KEY,
      totals,
      'Latest external match incremental sync summary',
      transaction
    ));
    return { message: 'Incremental match sync completed', data: totals };
  }
});

module.exports = {
  SYNC_CURSOR_CONFIG_KEY,
  HERO_NAME_ALIASES,
  heroNameKey,
  createIncrementalMatchSyncService,
  parseDuration,
  parseKad,
  mapWithConcurrency
};
