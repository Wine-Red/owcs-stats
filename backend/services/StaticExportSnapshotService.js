const Season = require('../models/Season');
const Team = require('../models/Team');
const Player = require('../models/Player');
const MapModel = require('../models/Map');
const Hero = require('../models/Hero');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const Config = require('../models/Config');
const SeasonStatsCalculator = require('./SeasonStatsCalculator');
const SeasonStageService = require('./SeasonStageService');

const plain = model => model?.get ? model.get({ plain: true }) : model;
const number = value => Number(value) || 0;

const canonicalPath = (pathname, params = {}) => {
  const url = new URL(pathname, 'http://snapshot.local');
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
};

const withoutKeys = (value, keys) => {
  const result = { ...value };
  keys.forEach(key => delete result[key]);
  return result;
};

const pushGrouped = (map, key, value) => {
  const normalizedKey = String(key);
  if (!map.has(normalizedKey)) map.set(normalizedKey, []);
  map.get(normalizedKey).push(value);
};

const serializeStageRange = range => ({
  id: range.id,
  seasonId: range.seasonId,
  name: range.name,
  startMatchId: range.startMatchId,
  startMatch: range.startMatch,
  endMatchId: range.endMatch?.id || null,
  endMatch: range.endMatch,
  matchCount: range.matchCount,
  isCurrent: range.isCurrent,
  createdAt: range.createdAt,
  updatedAt: range.updatedAt
});

const buildPlayerSeasonHistory = ({ player, rows, gameById, teamById, seasonById }) => {
  const bySeason = new Map();
  for (const data of rows) {
    const game = gameById.get(Number(data.mapGameId));
    const team = teamById.get(Number(data.teamId));
    if (!game || !team || game.seasonId == null) continue;
    const seasonId = Number(game.seasonId);
    if (!bySeason.has(seasonId)) {
      bySeason.set(seasonId, {
        id: null,
        seasonId,
        playerId: player.id,
        teamId: team.id,
        playerName: player.name,
        teamName: team.name,
        role: player.role,
        elims: 0,
        assists: 0,
        deaths: 0,
        damage: 0,
        healing: 0,
        mitigation: 0,
        gameTime: 0
      });
    }
    const aggregate = bySeason.get(seasonId);
    aggregate.teamId = team.id;
    aggregate.teamName = team.name;
    aggregate.elims += number(data.kills);
    aggregate.assists += number(data.assists);
    aggregate.deaths += number(data.deaths);
    aggregate.damage += number(data.damage);
    aggregate.healing += number(data.healing);
    aggregate.mitigation += number(data.mitigation);
    aggregate.gameTime += number(game.duration);
  }

  return Array.from(bySeason.values())
    .filter(row => seasonById.has(row.seasonId))
    .sort((a, b) => a.seasonId - b.seasonId)
    .map(stat => {
      stat.kd = stat.deaths ? stat.elims / stat.deaths : stat.elims;
      stat.kad = stat.deaths ? (stat.elims + stat.assists) / stat.deaths : stat.elims + stat.assists;
      for (const [source, target] of [
        ['elims', 'elimsPerMin'],
        ['assists', 'assistsPerMin'],
        ['deaths', 'deathsPerMin'],
        ['damage', 'damagePerMin'],
        ['healing', 'healingPerMin'],
        ['mitigation', 'mitigationPerMin']
      ]) stat[target] = stat.gameTime ? stat[source] / stat.gameTime : 0;
      stat.createdAt = null;
      stat.updatedAt = null;
      const season = seasonById.get(stat.seasonId);
      const team = teamById.get(Number(stat.teamId));
      stat.season = season
        ? { id: season.id, name: season.name, stage: season.stage, status: season.status }
        : null;
      stat.team = team
        ? { id: team.id, name: team.name, logo: team.logo, region: team.region }
        : null;
      return stat;
    });
};

const buildPlayerProfile = ({ player, rows, seasonHistory }) => {
  const heroGroups = new Map();
  const totals = {
    mapsPlayed: rows.length,
    duration: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    healing: 0,
    mitigation: 0,
    finalBlows: 0
  };

  const appearances = rows.map(data => {
    const mapGame = data.MapGame || {};
    const match = mapGame.Match || {};
    const map = mapGame.Map || {};
    const duration = number(mapGame.duration);
    totals.duration += duration;
    totals.kills += number(data.kills);
    totals.deaths += number(data.deaths);
    totals.assists += number(data.assists);
    totals.damage += number(data.damage);
    totals.healing += number(data.healing);
    totals.mitigation += number(data.mitigation);
    totals.finalBlows += number(data.finalBlows);

    const heroKey = data.heroId || 'unknown';
    const heroEntry = heroGroups.get(heroKey) || {
      heroId: data.heroId || null,
      heroName: data.hero?.name || '未记录英雄',
      subRole: data.hero?.subRole || '',
      mapsPlayed: 0,
      duration: 0,
      kills: 0,
      deaths: 0,
      assists: 0
    };
    heroEntry.mapsPlayed += 1;
    heroEntry.duration += duration;
    heroEntry.kills += number(data.kills);
    heroEntry.deaths += number(data.deaths);
    heroEntry.assists += number(data.assists);
    heroGroups.set(heroKey, heroEntry);

    const opponentId = String(mapGame.team1Id) === String(data.teamId)
      ? mapGame.team2Id
      : mapGame.team1Id;
    return {
      id: data.id,
      matchId: mapGame.matchId || null,
      matchDate: match.matchDate || mapGame.createdAt || null,
      mapGameId: mapGame.id || data.mapGameId,
      mapId: map.id || mapGame.mapId || null,
      mapName: map.name || '未知地图',
      mapType: map.type || '',
      teamId: data.teamId,
      team: data.team || null,
      opponentId,
      winnerId: mapGame.winnerId || match.winnerId || null,
      matchWinnerId: match.winnerId || null,
      matchTeam1Id: match.team1Id || null,
      matchTeam2Id: match.team2Id || null,
      matchTeam1Score: match.team1Score ?? null,
      matchTeam2Score: match.team2Score ?? null,
      boFormat: match.boFormat || '',
      hero: data.hero || null,
      duration,
      kills: number(data.kills),
      deaths: number(data.deaths),
      assists: number(data.assists),
      damage: number(data.damage),
      healing: number(data.healing),
      mitigation: number(data.mitigation)
    };
  });

  appearances.sort((a, b) => {
    const dateDiff = new Date(b.matchDate || 0) - new Date(a.matchDate || 0);
    return dateDiff || Number(b.mapGameId || 0) - Number(a.mapGameId || 0);
  });

  const heroPool = Array.from(heroGroups.values())
    .map(item => ({
      ...item,
      usageRate: totals.duration > 0 ? Number((item.duration / totals.duration * 100).toFixed(1)) : 0,
      kd: item.deaths > 0 ? Number((item.kills / item.deaths).toFixed(2)) : item.kills
    }))
    .sort((a, b) => b.duration - a.duration);

  return { player, totals, heroPool, recentMaps: appearances.slice(0, 12), seasonHistory };
};

const addHeroAnalyticsResponses = ({
  responses,
  seasons,
  heroes,
  players,
  playerSeasonPairs,
  mapGames,
  playerStats,
  playerHeroStats
}) => {
  const playerById = new Map(players.map(player => [Number(player.id), player]));
  const heroById = new Map(heroes.map(hero => [Number(hero.id), hero]));
  const gameById = new Map(mapGames.map(game => [Number(game.id), game]));
  const statById = new Map(playerStats.map(stat => [Number(stat.id), stat]));
  const rowsBySeason = new Map();

  for (const heroStat of playerHeroStats) {
    const stat = statById.get(Number(heroStat.playerStatId));
    const game = stat ? gameById.get(Number(stat.mapGameId)) : null;
    if (!stat || !game || game.seasonId == null) continue;
    pushGrouped(rowsBySeason, game.seasonId, { heroStat, stat, game });
  }

  for (const season of seasons) {
    const seasonId = Number(season.id);
    const seasonRows = rowsBySeason.get(String(seasonId)) || [];
    const seasonGames = mapGames.filter(game => Number(game.seasonId) === seasonId);
    const totalMapGames = seasonGames.length;
    const banByHero = new Map();
    for (const game of seasonGames) {
      for (const heroId of [game.team1BanHeroId, game.team2BanHeroId]) {
        if (heroId) banByHero.set(Number(heroId), (banByHero.get(Number(heroId)) || 0) + 1);
      }
    }

    const overviewByHero = new Map();
    const heroPlayerGroups = new Map();
    const playerHeroGroups = new Map();
    for (const { heroStat, stat, game } of seasonRows) {
      const heroId = Number(heroStat.heroId);
      if (!Number.isFinite(heroId)) continue;
      if (!overviewByHero.has(heroId)) {
        overviewByHero.set(heroId, {
          heroId,
          heroName: heroStat.heroName,
          mapIds: new Set(),
          pickCount: 0,
          usageSeconds: 0,
          finalBlows: 0,
          deathsByFinalBlow: 0,
          ultReady: 0,
          ultUsed: 0,
          ultChargeSum: 0,
          ultChargeCount: 0,
          winPicks: 0
        });
      }
      const overview = overviewByHero.get(heroId);
      if (String(heroStat.heroName || '') > String(overview.heroName || '')) overview.heroName = heroStat.heroName;
      overview.mapIds.add(Number(stat.mapGameId));
      overview.pickCount += 1;
      overview.usageSeconds += number(heroStat.usageSeconds);
      overview.finalBlows += number(heroStat.finalBlows);
      overview.deathsByFinalBlow += number(heroStat.deathsByFinalBlow);
      overview.ultReady += number(heroStat.ultReady);
      overview.ultUsed += number(heroStat.ultUsed);
      if (heroStat.avgUltChargeSeconds !== null && heroStat.avgUltChargeSeconds !== undefined) {
        overview.ultChargeSum += Number(heroStat.avgUltChargeSeconds);
        overview.ultChargeCount += 1;
      }
      if (Number(game.winnerId) === Number(stat.teamId)) overview.winPicks += 1;

      const heroPlayerKey = `${heroId}:${stat.playerId}`;
      if (!heroPlayerGroups.has(heroPlayerKey)) {
        heroPlayerGroups.set(heroPlayerKey, {
          heroId,
          playerId: Number(stat.playerId),
          teamId: Number(stat.teamId),
          usageSeconds: 0,
          finalBlows: 0,
          deathsByFinalBlow: 0,
          ultWeightedSum: 0,
          ultWeight: 0,
          mapIds: new Set()
        });
      }
      const heroPlayer = heroPlayerGroups.get(heroPlayerKey);
      const usage = number(heroStat.usageSeconds);
      heroPlayer.teamId = Number(stat.teamId);
      heroPlayer.usageSeconds += usage;
      heroPlayer.finalBlows += number(heroStat.finalBlows);
      heroPlayer.deathsByFinalBlow += number(heroStat.deathsByFinalBlow);
      heroPlayer.mapIds.add(Number(stat.mapGameId));
      if (heroStat.avgUltChargeSeconds !== null && heroStat.avgUltChargeSeconds !== undefined && usage > 0) {
        heroPlayer.ultWeightedSum += Number(heroStat.avgUltChargeSeconds) * usage;
        heroPlayer.ultWeight += usage;
      }

      const playerHeroKey = `${stat.playerId}:${heroId}`;
      if (!playerHeroGroups.has(playerHeroKey)) {
        playerHeroGroups.set(playerHeroKey, {
          playerId: Number(stat.playerId),
          heroId,
          usageSeconds: 0,
          finalBlows: 0,
          deathsByFinalBlow: 0,
          ultWeightedSum: 0,
          ultWeight: 0,
          mapIds: new Set()
        });
      }
      const playerHero = playerHeroGroups.get(playerHeroKey);
      playerHero.usageSeconds += usage;
      playerHero.finalBlows += number(heroStat.finalBlows);
      playerHero.deathsByFinalBlow += number(heroStat.deathsByFinalBlow);
      playerHero.mapIds.add(Number(stat.mapGameId));
      if (heroStat.avgUltChargeSeconds !== null && heroStat.avgUltChargeSeconds !== undefined && usage > 0) {
        playerHero.ultWeightedSum += Number(heroStat.avgUltChargeSeconds) * usage;
        playerHero.ultWeight += usage;
      }
    }

    const overviewData = [];
    const overviewHeroIds = new Set([...overviewByHero.keys(), ...banByHero.keys()]);
    for (const heroId of overviewHeroIds) {
      const aggregate = overviewByHero.get(heroId);
      const hero = heroById.get(heroId);
      const pickCount = aggregate?.pickCount || 0;
      const usageSeconds = aggregate?.usageSeconds || 0;
      const minutes = usageSeconds / 60;
      const finalBlows = aggregate?.finalBlows || 0;
      const banCount = banByHero.get(heroId) || 0;
      overviewData.push({
        heroId,
        heroName: hero?.name || aggregate?.heroName || '未知英雄',
        role: hero?.role || null,
        subRole: hero?.subRole || null,
        pickCount,
        mapsAppeared: aggregate?.mapIds.size || 0,
        pickRate: totalMapGames ? (aggregate?.mapIds.size || 0) / totalMapGames : 0,
        banCount,
        banRate: totalMapGames ? banCount / totalMapGames : 0,
        winRate: pickCount ? (aggregate?.winPicks || 0) / pickCount : 0,
        usageSeconds,
        finalBlows,
        finalBlowsPer10: minutes ? finalBlows / minutes * 10 : 0,
        deathsByFinalBlow: aggregate?.deathsByFinalBlow || 0,
        ultReady: aggregate?.ultReady || 0,
        ultUsed: aggregate?.ultUsed || 0,
        avgUltChargeSeconds: aggregate?.ultChargeCount
          ? aggregate.ultChargeSum / aggregate.ultChargeCount
          : null
      });
    }
    responses[canonicalPath('/stats/hero/overview', { seasonId })] = { data: overviewData, totalMapGames };

    for (const hero of heroes) {
      const data = Array.from(heroPlayerGroups.values())
        .filter(item => item.heroId === Number(hero.id))
        .map(item => {
          const minutes = item.usageSeconds / 60;
          return {
            playerId: item.playerId,
            playerName: playerById.get(item.playerId)?.name || `选手#${item.playerId}`,
            teamId: item.teamId,
            usageSeconds: item.usageSeconds,
            mapsPlayed: item.mapIds.size,
            finalBlows: item.finalBlows,
            finalBlowsPer10: minutes ? item.finalBlows / minutes * 10 : 0,
            fbPerDeath: item.deathsByFinalBlow > 0 ? item.finalBlows / item.deathsByFinalBlow : null,
            avgUltChargeSeconds: item.ultWeight > 0 ? item.ultWeightedSum / item.ultWeight : null
          };
        })
        .sort((a, b) => (b.finalBlowsPer10 - a.finalBlowsPer10) || (b.usageSeconds - a.usageSeconds));
      responses[canonicalPath('/stats/hero/players', { heroId: hero.id, seasonId })] = { data };
    }

    for (const player of players) {
      if (!playerSeasonPairs.has(`${player.id}:${seasonId}`)) continue;
      const data = Array.from(playerHeroGroups.values())
        .filter(item => item.playerId === Number(player.id))
        .map(item => {
          const minutes = item.usageSeconds / 60;
          return {
            heroId: item.heroId,
            usageSeconds: item.usageSeconds,
            mapsPlayed: item.mapIds.size,
            finalBlows: item.finalBlows,
            finalBlowsPer10: minutes ? item.finalBlows / minutes * 10 : 0,
            fbPerDeath: item.deathsByFinalBlow > 0 ? item.finalBlows / item.deathsByFinalBlow : null,
            avgUltChargeSeconds: item.ultWeight > 0 ? item.ultWeightedSum / item.ultWeight : null
          };
        })
        .sort((a, b) => b.usageSeconds - a.usageSeconds);
      responses[canonicalPath('/stats/player/heroes', { playerId: player.id, seasonId })] = { data };
    }
  }
};

const buildStaticExportSnapshot = async () => {
  const [
    seasonModels,
    teamModels,
    playerModels,
    mapModels,
    heroModels,
    seasonTeamModels,
    seasonTeamPlayerModels,
    configModels,
    matchModels,
    mapGameModels,
    playerStatModels,
    playerHeroStatModels
  ] = await Promise.all([
    Season.findAll(),
    Team.findAll(),
    Player.findAll(),
    MapModel.findAll(),
    Hero.findAll(),
    SeasonTeam.findAll({
      include: [
        { model: Season, attributes: ['id', 'name'], as: 'Season' },
        { model: Team, attributes: ['id', 'name'], as: 'Team' }
      ]
    }),
    SeasonTeamPlayer.findAll({
      include: [{ model: Player, attributes: ['id', 'name', 'role'] }]
    }),
    Config.findAll(),
    Match.findAll({
      include: [
        { model: Season },
        { model: Team, as: 'team1' },
        { model: Team, as: 'team2' },
        { model: Team, as: 'winner' }
      ],
      order: [['matchDate', 'DESC'], ['createdAt', 'DESC']]
    }),
    MapGame.findAll({
      include: [
        { model: Team, as: 'winner' },
        { model: MapModel },
        { model: Hero, as: 'team1BanHero' },
        { model: Hero, as: 'team2BanHero' }
      ]
    }),
    PlayerStat.findAll({
      include: [
        { model: Player, as: 'player' },
        { model: Hero, as: 'hero' },
        { model: Team, as: 'team' },
        {
          model: MapGame,
          include: [
            { model: Match, attributes: ['id', 'matchDate', 'team1Id', 'team2Id', 'winnerId', 'team1Score', 'team2Score', 'boFormat'] },
            { model: MapModel, attributes: ['id', 'name', 'type'] }
          ]
        },
        {
          model: PlayerHeroStat,
          as: 'heroStats',
          include: [{ model: Hero, as: 'hero' }]
        }
      ],
      order: [['id', 'ASC']]
    }),
    PlayerHeroStat.findAll({ raw: true, order: [['id', 'ASC']] })
  ]);

  const seasons = seasonModels.map(plain);
  const teams = teamModels.map(plain);
  const players = playerModels.map(plain);
  const maps = mapModels.map(plain);
  const heroes = heroModels.map(plain);
  const seasonTeams = seasonTeamModels.map(plain);
  const seasonTeamPlayers = seasonTeamPlayerModels.map(plain);
  const matches = matchModels.map(plain);
  const mapGamesDetailed = mapGameModels.map(plain);
  const playerStatsDetailed = playerStatModels.map(plain);
  const playerHeroStats = playerHeroStatModels.map(plain);
  const rawMatches = matches.map(match => withoutKeys(match, ['Season', 'team1', 'team2', 'winner']));
  const rawMapGames = mapGamesDetailed.map(game => withoutKeys(game, ['winner', 'Map', 'team1BanHero', 'team2BanHero']));
  const rawPlayerStats = playerStatsDetailed.map(stat => withoutKeys(stat, ['player', 'hero', 'team', 'MapGame', 'heroStats']));
  const responses = {
    '/seasons': seasons,
    '/teams': teams,
    '/players': players,
    '/maps': maps,
    '/heroes': heroes,
    '/season-teams': seasonTeams
  };
  const warnings = [];

  const expectedConfigKeys = new Set([
    'latest_match_sync_updates',
    'visualize_chart_config',
    'visualize_stage_season_order',
    ...seasons.map(season => `visualize_season_${season.id}`)
  ]);
  for (const configModel of configModels) {
    const config = plain(configModel);
    if (expectedConfigKeys.has(config.key)) responses[`/config/${encodeURIComponent(config.key)}`] = config.value;
  }
  for (const key of expectedConfigKeys) {
    if (!Object.prototype.hasOwnProperty.call(responses, `/config/${encodeURIComponent(key)}`)) {
      warnings.push(`GET /config/${encodeURIComponent(key)}: configuration not found`);
    }
  }

  responses[canonicalPath('/matches', { pageSize: 2000 })] = { total: matches.length, list: matches.slice(0, 2000) };
  for (const match of matches) responses[`/matches/${match.id}`] = match;
  for (const season of seasons) {
    const seasonMatches = matches.filter(match => Number(match.seasonId) === Number(season.id));
    responses[canonicalPath('/matches', { pageSize: 1000, seasonId: season.id })] = {
      total: seasonMatches.length,
      list: seasonMatches.slice(0, 1000)
    };
  }

  const mapGamesByMatch = new Map();
  for (const game of mapGamesDetailed) {
    if (game.matchId != null) pushGrouped(mapGamesByMatch, game.matchId, game);
  }
  for (const match of matches) responses[`/matches/${match.id}/map-games`] = mapGamesByMatch.get(String(match.id)) || [];

  const mapGamesForList = mapGamesDetailed
    .map(game => withoutKeys(game, ['team1BanHero', 'team2BanHero']))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  responses[canonicalPath('/map-games', { pageSize: 2000 })] = mapGamesForList.slice(0, 2000);
  for (const season of seasons) {
    const seasonGames = mapGamesForList.filter(game => Number(game.seasonId) === Number(season.id));
    responses[canonicalPath('/map-games', { pageSize: 1000, seasonId: season.id })] = seasonGames.slice(0, 1000);
    responses[canonicalPath('/map-games', { pageSize: 2000, seasonId: season.id })] = seasonGames.slice(0, 2000);
  }
  for (const seasonTeam of seasonTeams) {
    const teamGames = mapGamesForList.filter(game => (
      Number(game.seasonId) === Number(seasonTeam.seasonId)
      && [Number(game.team1Id), Number(game.team2Id)].includes(Number(seasonTeam.teamId))
    ));
    responses[canonicalPath('/map-games', {
      pageSize: 2000,
      seasonId: seasonTeam.seasonId,
      teamId: seasonTeam.teamId
    })] = teamGames.slice(0, 2000);
  }

  const statsByMapGame = new Map();
  const statsByPlayer = new Map();
  for (const stat of playerStatsDetailed) {
    const endpointStat = withoutKeys(stat, ['MapGame']);
    pushGrouped(statsByMapGame, stat.mapGameId, endpointStat);
    pushGrouped(statsByPlayer, stat.playerId, stat);
  }
  for (const game of rawMapGames) responses[`/map-games/${game.id}/player-stats`] = statsByMapGame.get(String(game.id)) || [];

  const rosterBySeasonTeam = new Map();
  for (const relation of seasonTeamPlayers) pushGrouped(rosterBySeasonTeam, relation.seasonTeamId, relation);
  for (const seasonTeam of seasonTeams) {
    responses[`/season-teams/${seasonTeam.id}/players`] = rosterBySeasonTeam.get(String(seasonTeam.id)) || [];
  }

  const teamsById = new Map(teams.map(team => [Number(team.id), team]));
  for (const season of seasons) {
    responses[`/seasons/${season.id}/teams`] = seasonTeams
      .filter(item => Number(item.seasonId) === Number(season.id))
      .map(item => teamsById.get(Number(item.teamId)))
      .filter(Boolean)
      .map(team => ({ id: team.id, name: team.name, region: team.region, logo: team.logo }));
  }

  const gameById = new Map(rawMapGames.map(game => [Number(game.id), game]));
  const seasonById = new Map(seasons.map(season => [Number(season.id), season]));
  const playerSeasonPairs = new Set();
  for (const seasonTeam of seasonTeams) {
    for (const relation of rosterBySeasonTeam.get(String(seasonTeam.id)) || []) {
      playerSeasonPairs.add(`${relation.playerId}:${seasonTeam.seasonId}`);
    }
  }
  for (const player of players) {
    const rows = statsByPlayer.get(String(player.id)) || [];
    const seasonHistory = buildPlayerSeasonHistory({
      player,
      rows: rows.map(stat => withoutKeys(stat, ['player', 'hero', 'team', 'MapGame', 'heroStats'])),
      gameById,
      teamById: teamsById,
      seasonById
    });
    responses[`/stats/player/${player.id}/profile`] = buildPlayerProfile({ player, rows, seasonHistory });
    for (const pair of playerSeasonPairs) {
      const [playerId, seasonId] = pair.split(':');
      if (Number(playerId) !== Number(player.id)) continue;
      const seasonRows = rows.filter(stat => Number(stat.MapGame?.seasonId) === Number(seasonId));
      responses[canonicalPath(`/stats/player/${player.id}/profile`, { seasonId })] = buildPlayerProfile({
        player,
        rows: seasonRows,
        seasonHistory
      });
    }
  }

  addHeroAnalyticsResponses({
    responses,
    seasons,
    heroes,
    players,
    playerSeasonPairs,
    mapGames: rawMapGames,
    playerStats: rawPlayerStats,
    playerHeroStats
  });

  const teamById = teamsById;
  const mapById = new Map(maps.map(map => [Number(map.id), map]));
  const playerById = new Map(players.map(player => [Number(player.id), player]));
  const rawStatById = new Map(rawPlayerStats.map(stat => [Number(stat.id), stat]));
  const heroRoleById = new Map(heroes.map(hero => [Number(hero.id), hero.role]));
  for (const season of seasons) {
    const seasonId = Number(season.id);
    const seasonMatches = rawMatches
      .filter(match => Number(match.seasonId) === seasonId)
      .sort((a, b) => (
        new Date(a.matchDate || 0) - new Date(b.matchDate || 0)
        || Number(a.id) - Number(b.id)
      ));
    const seasonMapGames = rawMapGames.filter(game => Number(game.seasonId) === seasonId);
    const seasonGameIds = new Set(seasonMapGames.map(game => Number(game.id)));
    const seasonPlayerStats = rawPlayerStats.filter(stat => seasonGameIds.has(Number(stat.mapGameId)));
    const rawData = {
      matches: seasonMatches,
      mapGames: seasonMapGames,
      playerStats: seasonPlayerStats,
      teamById,
      mapById,
      playerById,
      gameById: new Map(seasonMapGames.map(game => [Number(game.id), game]))
    };
    const calculatorOptions = { rawData, playerHeroStats, heroRoleById };
    const stageRanges = await SeasonStageService.listSeasonStageRanges(seasonId);

    responses[`/season-stats/${seasonId}`] = await SeasonStatsCalculator.calculateSeasonPlayerStats(seasonId, calculatorOptions);
    responses[`/season-stats/${seasonId}/team-score`] = await SeasonStatsCalculator.calculateSeasonTeamScoreStats(seasonId, calculatorOptions);
    responses[`/season-stats/${seasonId}/map-picks`] = await SeasonStatsCalculator.calculateSeasonMapPickStats(seasonId, calculatorOptions);
    responses[`/season-stats/${seasonId}/stages`] = stageRanges.map(serializeStageRange);
    responses[`/season-stats/${seasonId}/features`] = {
      seasonId,
      totalMapGames: seasonMapGames.length,
      hasBans: seasonMapGames.some(game => game.team1BanHeroId || game.team2BanHeroId),
      hasHeroStats: playerHeroStats.some(heroStat => seasonGameIds.has(Number(
        rawStatById.get(Number(heroStat.playerStatId))?.mapGameId
      ))),
      hasFinalBlows: seasonPlayerStats.some(stat => number(stat.finalBlows) > 0),
      hasUltCharge: playerHeroStats.some(heroStat => {
        const stat = rawStatById.get(Number(heroStat.playerStatId));
        return stat && seasonGameIds.has(Number(stat.mapGameId)) && (
          heroStat.avgUltChargeSeconds !== null || number(heroStat.ultReady) > 0 || number(heroStat.ultUsed) > 0
        );
      })
    };

    for (const range of stageRanges) {
      responses[canonicalPath(`/season-stats/${seasonId}/team-score`, { stageId: range.id })] =
        await SeasonStatsCalculator.calculateSeasonTeamScoreStats(seasonId, {
          ...calculatorOptions,
          matchIds: range.matchIds
        });
    }

    for (const seasonTeam of seasonTeams.filter(item => Number(item.seasonId) === seasonId)) {
      responses[`/season-stats/${seasonId}/teams/${seasonTeam.teamId}/compositions`] =
        await SeasonStatsCalculator.calculateSeasonTeamCompositions(seasonId, seasonTeam.teamId, calculatorOptions);
      responses[`/season-stats/${seasonId}/teams/${seasonTeam.teamId}/hero-stats`] =
        await SeasonStatsCalculator.calculateSeasonTeamHeroStats(seasonId, seasonTeam.teamId, calculatorOptions);
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'OWCS Stats server-side static snapshot',
    counts: {
      seasons: seasons.length,
      teams: teams.length,
      players: players.length,
      maps: maps.length,
      heroes: heroes.length,
      matches: matches.length,
      mapGames: rawMapGames.length,
      responses: Object.keys(responses).length
    },
    warnings,
    responses
  };
};

module.exports = { buildStaticExportSnapshot, canonicalPath };
