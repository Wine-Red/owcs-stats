const { Op } = require('sequelize');
const Season = require('../models/Season');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonStage = require('../models/SeasonStage');
const Team = require('../models/Team');
const Player = require('../models/Player');
const MapModel = require('../models/Map');
const Hero = require('../models/Hero');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const SeasonStageService = require('../services/SeasonStageService');
const { getUpcomingMatches } = require('../services/UpcomingMatchesService');
const {
  API_VERSION,
  SCHEMA_VERSION,
  buildOptionalAvailability,
  idName,
  plain,
  serializeHero,
  serializeMap,
  serializeMapGame,
  serializeMatch,
  serializePlayer,
  serializePlayerHeroStat,
  serializePlayerStat,
  serializeSeason,
  serializeStage,
  serializeTeam,
  statusFromAvailability
} = require('../services/AgentApiContract');

const MATCH_INCLUDE = [
  { model: Season, attributes: ['id', 'name'] },
  { model: Team, as: 'team1', attributes: ['id', 'name'] },
  { model: Team, as: 'team2', attributes: ['id', 'name'] },
  { model: Team, as: 'winner', attributes: ['id', 'name'] }
];

const MAP_GAME_INCLUDE = [
  { model: MapModel, attributes: ['id', 'name', 'type'] },
  { model: Team, as: 'team1', attributes: ['id', 'name'] },
  { model: Team, as: 'team2', attributes: ['id', 'name'] },
  { model: Team, as: 'winner', attributes: ['id', 'name'] },
  { model: Hero, as: 'team1BanHero', attributes: ['id', 'name'] },
  { model: Hero, as: 'team2BanHero', attributes: ['id', 'name'] }
];

class AgentApiError extends Error {
  constructor(status, code, message, field = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const requiredPositiveId = (value, field) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new AgentApiError(400, 'INVALID_ARGUMENT', `${field} must be a positive integer`, field);
  }
  return number;
};

const optionalPositiveId = (value, field) => (
  value === undefined || value === null || value === ''
    ? null
    : requiredPositiveId(value, field)
);

const parseLimit = value => {
  if (value === undefined) return 50;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new AgentApiError(400, 'INVALID_ARGUMENT', 'limit must be an integer between 1 and 200', 'limit');
  }
  return limit;
};

const parseCursor = value => {
  if (!value) return 0;
  try {
    const decoded = Buffer.from(String(value), 'base64url').toString('utf8');
    const offset = Number(decoded);
    if (!Number.isInteger(offset) || offset < 0) throw new Error('invalid cursor');
    return offset;
  } catch (_error) {
    throw new AgentApiError(400, 'INVALID_ARGUMENT', 'cursor is invalid', 'cursor');
  }
};

const nextCursor = offset => Buffer.from(String(offset), 'utf8').toString('base64url');

const sendData = (res, data, extra = {}) => res.json({
  api_version: API_VERSION,
  schema_version: SCHEMA_VERSION,
  request_id: res.locals.requestId,
  data,
  ...extra
});

const sendList = (res, rows, { limit, offset }) => {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return sendData(res, data, {
    pagination: {
      count: data.length,
      limit,
      next_cursor: hasMore ? nextCursor(offset + limit) : null
    }
  });
};

const paginate = query => ({
  limit: query.limit + 1,
  offset: query.offset
});

const listContext = query => {
  const limit = parseLimit(query.limit);
  const offset = parseCursor(query.cursor);
  return { limit, offset };
};

const normalizeName = value => String(value || '')
  .normalize('NFKC')
  .replace(/\s+/g, '')
  .toLocaleLowerCase();

const exactNameMatch = (name, rows, fields = ['name']) => {
  const key = normalizeName(name);
  if (!key || key === 'tbd') return null;
  const matches = rows.filter(row => fields.some(field => normalizeName(row[field]) === key));
  return matches.length === 1 ? matches[0] : null;
};

const uniqueContainedNameMatch = (name, rows) => {
  const key = normalizeName(name);
  const matches = rows.filter(row => {
    const candidate = normalizeName(row.name);
    return candidate && key.includes(candidate);
  });
  return matches.length === 1 ? matches[0] : null;
};

const loadStagesForSeasons = async seasonIds => {
  const stageMaps = new Map();
  await Promise.all([...new Set(seasonIds.map(Number))].map(async seasonId => {
    const ranges = await SeasonStageService.listSeasonStageRanges(seasonId);
    for (const range of ranges) {
      for (const matchId of range.matchIds) stageMaps.set(Number(matchId), range);
    }
  }));
  return stageMaps;
};

const loadMapGameCounts = async mapGameIds => {
  const ids = mapGameIds.map(Number);
  if (!ids.length) return new Map();
  const playerStats = await PlayerStat.findAll({
    where: { mapGameId: { [Op.in]: ids } },
    attributes: ['id', 'mapGameId'],
    raw: true
  });
  const playerStatIds = playerStats.map(row => row.id);
  const heroStats = playerStatIds.length
    ? await PlayerHeroStat.findAll({
        where: { playerStatId: { [Op.in]: playerStatIds } },
        attributes: ['id', 'playerStatId'],
        raw: true
      })
    : [];
  const mapGameIdByPlayerStat = new Map(playerStats.map(row => [Number(row.id), Number(row.mapGameId)]));
  const counts = new Map(ids.map(id => [id, {
    playerStatCount: 0,
    heroStatCount: 0,
    playerStatsWithHeroStats: 0,
    heroPlayerStatIds: new Set()
  }]));
  for (const row of playerStats) counts.get(Number(row.mapGameId)).playerStatCount += 1;
  for (const row of heroStats) {
    const mapGameId = mapGameIdByPlayerStat.get(Number(row.playerStatId));
    if (counts.has(mapGameId)) {
      const count = counts.get(mapGameId);
      count.heroStatCount += 1;
      count.heroPlayerStatIds.add(Number(row.playerStatId));
    }
  }
  for (const count of counts.values()) {
    count.playerStatsWithHeroStats = count.heroPlayerStatIds.size;
  }
  return counts;
};

const ensureMatch = async matchId => {
  const match = await Match.findByPk(matchId, { include: MATCH_INCLUDE });
  if (!match) throw new AgentApiError(404, 'NOT_FOUND', 'match not found');
  return match;
};

const ensureMapGame = async (matchId, mapGameId) => {
  const game = await MapGame.findOne({
    where: { id: mapGameId, matchId },
    include: MAP_GAME_INCLUDE
  });
  if (!game) throw new AgentApiError(404, 'NOT_FOUND', 'map game not found in this match');
  return game;
};

const buildMatchCoverage = async matchId => {
  const games = await MapGame.findAll({ where: { matchId }, attributes: ['id', 'updatedAt'], raw: true });
  const gameIds = games.map(game => Number(game.id));
  const counts = await loadMapGameCounts(gameIds);
  return {
    match_id: Number(matchId),
    map_count: gameIds.length,
    maps_with_player_stats: gameIds.filter(id => counts.get(id)?.playerStatCount > 0).length,
    player_stat_rows: gameIds.reduce((sum, id) => sum + (counts.get(id)?.playerStatCount || 0), 0),
    maps_with_hero_stats: gameIds.filter(id => counts.get(id)?.heroStatCount > 0).length,
    player_hero_stat_rows: gameIds.reduce((sum, id) => sum + (counts.get(id)?.heroStatCount || 0), 0)
  };
};

const AgentApiController = {
  meta: async (_req, res) => sendData(res, {
    service: 'OWCS Stats Agent API',
    api_version: API_VERSION,
    schema_version: SCHEMA_VERSION,
    boundaries: {
      rosters: 'Season and team membership only; no join or leave timeline.',
      core_player_metrics: ['kills', 'deaths', 'assists', 'damage', 'healing', 'mitigation'],
      optional_player_metrics: ['ults_used', 'final_blows'],
      optional_datasets: ['player_hero_stats'],
      optional_map_facts: ['bans', 'duration'],
      unknown_is_not_zero: true
    }
  }),

  seasons: async (req, res) => {
    const list = listContext(req.query);
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const rows = await Season.findAll({
      where,
      attributes: ['id', 'name', 'status'],
      order: [['id', 'ASC']],
      ...paginate(list)
    });
    return sendList(res, rows.map(serializeSeason), list);
  },

  stages: async (req, res) => {
    const seasonId = requiredPositiveId(req.params.seasonId, 'season_id');
    const season = await Season.findByPk(seasonId, { attributes: ['id'] });
    if (!season) throw new AgentApiError(404, 'NOT_FOUND', 'season not found');
    const ranges = await SeasonStageService.listSeasonStageRanges(seasonId);
    return sendData(res, ranges.map((range, index) => serializeStage(range, index + 1)));
  },

  teams: async (req, res) => {
    const list = listContext(req.query);
    const seasonId = optionalPositiveId(req.query.season_id, 'season_id');
    const where = {};
    if (req.query.q) where.name = { [Op.like]: `%${String(req.query.q).trim()}%` };
    if (seasonId) {
      const memberships = await SeasonTeam.findAll({ where: { seasonId }, attributes: ['teamId'], raw: true });
      where.id = { [Op.in]: memberships.map(row => row.teamId) };
    }
    const rows = await Team.findAll({ where, attributes: ['id', 'name'], order: [['name', 'ASC']], ...paginate(list) });
    return sendList(res, rows.map(serializeTeam), list);
  },

  players: async (req, res) => {
    const list = listContext(req.query);
    const seasonId = optionalPositiveId(req.query.season_id, 'season_id');
    const teamId = optionalPositiveId(req.query.team_id, 'team_id');
    const where = {};
    if (req.query.q) where.name = { [Op.like]: `%${String(req.query.q).trim()}%` };
    if (req.query.role) where.role = req.query.role;
    if (seasonId || teamId) {
      const seasonTeamWhere = {};
      if (seasonId) seasonTeamWhere.seasonId = seasonId;
      if (teamId) seasonTeamWhere.teamId = teamId;
      const seasonTeams = await SeasonTeam.findAll({ where: seasonTeamWhere, attributes: ['id'], raw: true });
      const memberships = await SeasonTeamPlayer.findAll({
        where: { seasonTeamId: { [Op.in]: seasonTeams.map(row => row.id) } },
        attributes: ['playerId'],
        raw: true
      });
      where.id = { [Op.in]: memberships.map(row => row.playerId) };
    }
    const rows = await Player.findAll({ where, attributes: ['id', 'name', 'role'], order: [['name', 'ASC']], ...paginate(list) });
    return sendList(res, rows.map(serializePlayer), list);
  },

  maps: async (req, res) => {
    const list = listContext(req.query);
    const rows = await MapModel.findAll({ attributes: ['id', 'name', 'type'], order: [['name', 'ASC']], ...paginate(list) });
    return sendList(res, rows.map(serializeMap), list);
  },

  heroes: async (req, res) => {
    const list = listContext(req.query);
    const where = req.query.role ? { role: req.query.role } : {};
    const rows = await Hero.findAll({ where, attributes: ['id', 'name', 'role', 'subRole'], order: [['name', 'ASC']], ...paginate(list) });
    return sendList(res, rows.map(serializeHero), list);
  },

  rosters: async (req, res) => {
    const list = listContext(req.query);
    const seasonId = requiredPositiveId(req.query.season_id, 'season_id');
    const teamId = optionalPositiveId(req.query.team_id, 'team_id');
    const playerId = optionalPositiveId(req.query.player_id, 'player_id');
    if (!teamId && !playerId) {
      throw new AgentApiError(400, 'INVALID_ARGUMENT', 'team_id or player_id is required', 'team_id');
    }
    const seasonTeams = await SeasonTeam.findAll({
      where: { seasonId, ...(teamId ? { teamId } : {}) },
      include: [
        { model: Season, as: 'Season', attributes: ['id', 'name'] },
        { model: Team, as: 'Team', attributes: ['id', 'name'] }
      ]
    });
    const byId = new Map(seasonTeams.map(row => [Number(row.id), plain(row)]));
    const rows = await SeasonTeamPlayer.findAll({
      where: {
        seasonTeamId: { [Op.in]: [...byId.keys()] },
        ...(playerId ? { playerId } : {})
      },
      include: [{ model: Player, attributes: ['id', 'name', 'role'] }],
      order: [['id', 'ASC']],
      ...paginate(list)
    });
    const data = rows.map(rowValue => {
      const row = plain(rowValue);
      const seasonTeam = byId.get(Number(row.seasonTeamId));
      return {
        season: idName(seasonTeam.Season),
        team: idName(seasonTeam.Team),
        player: serializePlayer(row.Player)
      };
    });
    return sendList(res, data, list);
  },

  matches: async (req, res) => {
    const list = listContext(req.query);
    const seasonId = optionalPositiveId(req.query.season_id, 'season_id');
    const stageId = optionalPositiveId(req.query.stage_id, 'stage_id');
    const teamId = optionalPositiveId(req.query.team_id, 'team_id');
    if (stageId && !seasonId) {
      throw new AgentApiError(400, 'INVALID_ARGUMENT', 'season_id is required when stage_id is used', 'season_id');
    }
    if (!seasonId && !teamId && !req.query.date_from && !req.query.date_to) {
      throw new AgentApiError(400, 'INVALID_ARGUMENT', 'at least one match filter is required');
    }
    const where = {};
    if (seasonId) where.seasonId = seasonId;
    if (teamId) where[Op.or] = [{ team1Id: teamId }, { team2Id: teamId }];
    if (req.query.date_from || req.query.date_to) {
      where.matchDate = {};
      if (req.query.date_from) where.matchDate[Op.gte] = req.query.date_from;
      if (req.query.date_to) where.matchDate[Op.lte] = req.query.date_to;
    }
    if (stageId) {
      const stage = await SeasonStageService.resolveStageRange(seasonId, stageId);
      if (!stage) throw new AgentApiError(404, 'NOT_FOUND', 'stage not found in this season');
      where.id = { [Op.in]: stage.matchIds };
    }
    const rows = await Match.findAll({ where, include: MATCH_INCLUDE, order: [['matchDate', 'DESC'], ['id', 'DESC']], ...paginate(list) });
    const stages = await loadStagesForSeasons(rows.map(row => plain(row).seasonId));
    return sendList(res, rows.map(row => serializeMatch(row, stages.get(Number(plain(row).id)))), list);
  },

  match: async (req, res) => {
    const matchId = requiredPositiveId(req.params.matchId, 'match_id');
    const match = await ensureMatch(matchId);
    const row = plain(match);
    const stages = await loadStagesForSeasons([row.seasonId]);
    const games = await MapGame.findAll({ where: { matchId }, include: MAP_GAME_INCLUDE, order: [['id', 'ASC']] });
    const counts = await loadMapGameCounts(games.map(game => plain(game).id));
    return sendData(res, {
      match: serializeMatch(match, stages.get(matchId)),
      map_games: games.map(game => serializeMapGame(game, counts.get(Number(plain(game).id)))),
      coverage: await buildMatchCoverage(matchId)
    });
  },

  upcomingMatches: async (_req, res) => {
    const result = await getUpcomingMatches();
    const [seasons, teams, allStages] = await Promise.all([
      Season.findAll({ attributes: ['id', 'name', 'externalEventName'], raw: true }),
      Team.findAll({ attributes: ['id', 'name'], raw: true }),
      SeasonStage.findAll({ attributes: ['id', 'seasonId', 'name'], raw: true })
    ]);
    const data = result.data.map(item => {
      const season = exactNameMatch(item.tournamentName, seasons, ['name', 'externalEventName']);
      const stages = season ? allStages.filter(stage => Number(stage.seasonId) === Number(season.id)) : [];
      const stage = uniqueContainedNameMatch(item.tournamentName, stages);
      const team1 = exactNameMatch(item.team1?.name, teams);
      const team2 = exactNameMatch(item.team2?.name, teams);
      return {
        scheduled_at: Number.isFinite(item.timestamp) ? new Date(item.timestamp).toISOString() : null,
        tournament_name: item.tournamentName || null,
        season: idName(season),
        stage: idName(stage),
        team1: team1 ? idName(team1) : { id: null, name: item.team1?.name || 'TBD' },
        team2: team2 ? idName(team2) : { id: null, name: item.team2?.name || 'TBD' },
        source: { provider: 'liquipedia', url: item.link || null }
      };
    });
    return sendData(res, data, {
      source_status: {
        cached: result.cached,
        stale: result.stale,
        error: result.error || null
      }
    });
  },

  mapGames: async (req, res) => {
    const matchId = requiredPositiveId(req.params.matchId, 'match_id');
    await ensureMatch(matchId);
    const games = await MapGame.findAll({ where: { matchId }, include: MAP_GAME_INCLUDE, order: [['id', 'ASC']] });
    const counts = await loadMapGameCounts(games.map(game => plain(game).id));
    return sendData(res, games.map(game => serializeMapGame(game, counts.get(Number(plain(game).id)))));
  },

  mapGame: async (req, res) => {
    const matchId = requiredPositiveId(req.params.matchId, 'match_id');
    const mapGameId = requiredPositiveId(req.params.mapGameId, 'map_game_id');
    const game = await ensureMapGame(matchId, mapGameId);
    const counts = await loadMapGameCounts([mapGameId]);
    return sendData(res, serializeMapGame(game, counts.get(mapGameId)));
  },

  playerStats: async (req, res) => {
    const matchId = requiredPositiveId(req.params.matchId, 'match_id');
    const mapGameId = requiredPositiveId(req.params.mapGameId, 'map_game_id');
    const game = await ensureMapGame(matchId, mapGameId);
    const counts = await loadMapGameCounts([mapGameId]);
    const count = counts.get(mapGameId);
    const availability = buildOptionalAvailability({
      statsVersion: plain(game).statsVersion,
      playerStatCount: count?.playerStatCount,
      heroStatCount: count?.heroStatCount,
      playerStatsWithHeroStats: count?.playerStatsWithHeroStats
    });
    const rows = await PlayerStat.findAll({
      where: { mapGameId },
      include: [
        { model: Player, as: 'player', attributes: ['id', 'name', 'role'] },
        { model: Team, as: 'team', attributes: ['id', 'name'] }
      ],
      order: [['teamId', 'ASC'], ['id', 'ASC']]
    });
    const data = rows.map(row => {
      const rowId = Number(plain(row).id);
      const rowAvailability = { ...availability };
      for (const key of ['ults_used', 'final_blows']) {
        if (Number(plain(game).statsVersion) >= 2 && ['partial', 'unknown'].includes(availability[key])) {
          rowAvailability[key] = count?.heroPlayerStatIds?.has(rowId) ? 'available' : 'unknown';
        }
      }
      return serializePlayerStat(row, rowAvailability);
    });
    return sendData(res, data, { availability });
  },

  playerHeroStats: async (req, res) => {
    const matchId = requiredPositiveId(req.params.matchId, 'match_id');
    const mapGameId = requiredPositiveId(req.params.mapGameId, 'map_game_id');
    const playerStatId = requiredPositiveId(req.params.playerStatId, 'player_stat_id');
    const game = await ensureMapGame(matchId, mapGameId);
    const playerStat = await PlayerStat.findOne({ where: { id: playerStatId, mapGameId } });
    if (!playerStat) throw new AgentApiError(404, 'NOT_FOUND', 'player stat not found in this map game');
    const rows = await PlayerHeroStat.findAll({
      where: { playerStatId },
      include: [{ model: Hero, as: 'hero', attributes: ['id', 'name', 'role', 'subRole'] }],
      order: [['usageSeconds', 'DESC'], ['id', 'ASC']]
    });
    const availability = rows.length
      ? 'available'
      : (Number(plain(game).statsVersion) >= 2 ? 'unknown' : 'unavailable');
    return sendData(res, rows.map(serializePlayerHeroStat), { availability });
  },

  matchCoverage: async (req, res) => {
    const matchId = requiredPositiveId(req.params.matchId, 'match_id');
    await ensureMatch(matchId);
    return sendData(res, await buildMatchCoverage(matchId));
  },

  seasonCoverage: async (req, res) => {
    const seasonId = requiredPositiveId(req.params.seasonId, 'season_id');
    const season = await Season.findByPk(seasonId, { attributes: ['id'] });
    if (!season) throw new AgentApiError(404, 'NOT_FOUND', 'season not found');
    const matches = await Match.findAll({ where: { seasonId }, attributes: ['id'], raw: true });
    const matchIds = matches.map(match => match.id);
    const mapGameWhere = matchIds.length
      ? { [Op.or]: [{ seasonId }, { matchId: { [Op.in]: matchIds } }] }
      : { seasonId };
    const games = await MapGame.findAll({
      where: mapGameWhere,
      attributes: ['id', 'statsVersion', 'team1BanHeroId', 'team2BanHeroId', 'duration'],
      raw: true
    });
    const counts = await loadMapGameCounts(games.map(game => game.id));
    const perGame = games.map(game => buildOptionalAvailability({
      statsVersion: game.statsVersion,
      playerStatCount: counts.get(Number(game.id))?.playerStatCount,
      heroStatCount: counts.get(Number(game.id))?.heroStatCount,
      playerStatsWithHeroStats: counts.get(Number(game.id))?.playerStatsWithHeroStats
    }));
    const factStatus = values => statusFromAvailability(values.map(value => value ? 'recorded' : 'unknown'));
    return sendData(res, {
      season_id: seasonId,
      map_count: games.length,
      availability: {
        matches: 'available',
        map_games: games.length ? 'available' : 'unknown',
        player_stats: statusFromAvailability(perGame.map(item => item.player_stats)),
        ults_used: statusFromAvailability(perGame.map(item => item.ults_used)),
        final_blows: statusFromAvailability(perGame.map(item => item.final_blows)),
        player_hero_stats: statusFromAvailability(perGame.map(item => item.player_hero_stats)),
        bans: factStatus(games.map(game => game.team1BanHeroId || game.team2BanHeroId)),
        duration: factStatus(games.map(game => Number(game.duration) > 0))
      }
    });
  }
};

module.exports = {
  AgentApiController,
  AgentApiError,
  buildMatchCoverage,
  exactNameMatch,
  loadMapGameCounts,
  parseCursor,
  parseLimit,
  requiredPositiveId,
  sendData,
  sendList,
  uniqueContainedNameMatch
};
