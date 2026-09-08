const { buildStageRanges } = require('../SeasonStageService');
const { MODES } = require('./parameters');
const { notFound, unavailable } = require('./errors');
const dto = require('./contract');

const CATALOGS = {
  competitions: { table: 'seasons', fields: 'c.id, c.name, c.status', serialize: dto.competition },
  teams: { table: 'teams', fields: 'c.id, c.name', serialize: dto.team },
  players: { table: 'players', fields: 'c.id, c.name, c.role', serialize: dto.player },
  maps: { table: 'maps', fields: 'c.id, c.name, c.type', serialize: dto.map },
  heroes: { table: 'heroes', fields: 'c.id, c.name, c.role, c.subRole', serialize: dto.hero }
};
const MATCH_SELECT = `SELECT m.id, m.seasonId, c.name AS competitionName, m.matchDate, m.boFormat,
  m.team1Id, t1.name AS team1Name, m.team2Id, t2.name AS team2Name, m.team1Score, m.team2Score, m.winnerId
  FROM matches m LEFT JOIN seasons c ON c.id = m.seasonId
  LEFT JOIN teams t1 ON t1.id = m.team1Id LEFT JOIN teams t2 ON t2.id = m.team2Id`;
const GAME_SELECT = `SELECT g.id, g.matchId, g.seasonId, g.mapId, mp.name AS mapName, mp.type AS mapType,
  g.team1Id, t1.name AS team1Name, g.team2Id, t2.name AS team2Name, g.team1Score, g.team2Score, g.winnerId,
  g.team1BanHeroId, h1.name AS team1BanHeroName, g.team2BanHeroId, h2.name AS team2BanHeroName,
  g.duration, g.externalRoundIndex, g.replayId
  FROM map_games g LEFT JOIN maps mp ON mp.id = g.mapId
  LEFT JOIN teams t1 ON t1.id = g.team1Id LEFT JOIN teams t2 ON t2.id = g.team2Id
  LEFT JOIN heroes h1 ON h1.id = g.team1BanHeroId LEFT JOIN heroes h2 ON h2.id = g.team2BanHeroId`;
const placeholders = ids => ids.map(() => '?').join(',');
const grouped = (rows, key) => {
  const result = new Map();
  for (const row of rows) {
    const id = Number(row[key]);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(row);
  }
  return result;
};
// LOCATE treats %, _ and backslash literally. Apply whitespace normalization to
// both operands and use a binary collation after LOWER, avoiding accent folding.
const contains = column => `LOCATE(?, LOWER(TRIM(REGEXP_REPLACE(${column}, '[[:space:]]+', ' '))) COLLATE utf8mb4_bin) > 0`;

class PublicDataRepository {
  constructor(select) { this.select = select; this.stageCache = new Map(); }

  async requireCatalog(kind, id) {
    const spec = CATALOGS[kind];
    const rows = await this.select(`SELECT ${spec.fields} FROM ${spec.table} c WHERE c.id = ?`, [id]);
    if (!rows.length) throw notFound();
    return rows[0];
  }

  async aliases(ids) {
    if (!ids.length) return new Map();
    const rows = await this.select(`SELECT teamId, alias FROM team_aliases WHERE teamId IN (${placeholders(ids)}) ORDER BY teamId, alias`, ids);
    return grouped(rows, 'teamId');
  }

  async catalog(kind, query = {}, after, competitionId) {
    const spec = CATALOGS[kind], where = [], values = [];
    const add = (sql, ...params) => { where.push(sql); values.push(...params); };
    if (query.q) {
      if (kind === 'teams') add(`(${contains('c.name')} OR EXISTS (SELECT 1 FROM team_aliases a WHERE a.teamId = c.id AND ${contains('a.alias')}))`, query.q, query.q);
      else add(contains('c.name'), query.q);
    }
    if (query.status) add('c.status = ?', query.status);
    if (query.role) add('c.role = ?', query.role);
    if (query.mode) add('c.type = ?', MODES[query.mode]);
    if (after) add('c.id > ?', after.id);
    if (competitionId !== undefined) {
      await this.requireCatalog('competitions', competitionId);
      add('EXISTS (SELECT 1 FROM season_teams st WHERE st.teamId = c.id AND st.seasonId = ?)', competitionId);
    }
    if (kind === 'players' && (query.competition_id || query.team_id)) {
      const conditions = [], params = [];
      if (query.competition_id) {
        await this.requireCatalog('competitions', query.competition_id);
        conditions.push('st.seasonId = ?'); params.push(query.competition_id);
      }
      if (query.team_id) {
        await this.requireCatalog('teams', query.team_id);
        conditions.push('st.teamId = ?'); params.push(query.team_id);
      }
      add(`EXISTS (SELECT 1 FROM season_team_players sp JOIN season_teams st ON st.id = sp.seasonTeamId
        WHERE sp.playerId = c.id AND ${conditions.join(' AND ')})`, ...params);
    }
    // LIMIT is an internally parsed integer (1..101), never untrusted SQL text.
    const rows = await this.select(`SELECT ${spec.fields} FROM ${spec.table} c ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.id ASC LIMIT ${query.limit + 1}`, values);
    const aliases = kind === 'teams' ? await this.aliases(rows.map(row => row.id)) : new Map();
    return rows.map(row => spec.serialize(row, (aliases.get(Number(row.id)) || []).map(a => a.alias)));
  }

  async catalogItem(kind, id) {
    const row = await this.requireCatalog(kind, id);
    const aliases = kind === 'teams' ? await this.aliases([id]) : new Map();
    return CATALOGS[kind].serialize(row, (aliases.get(id) || []).map(a => a.alias));
  }

  async stages(competitionId) {
    if (!this.stageCache.has(competitionId)) {
      const matches = await this.select('SELECT id, seasonId, matchDate FROM matches WHERE seasonId = ? ORDER BY matchDate, id', [competitionId]);
      const stages = await this.select('SELECT id, seasonId, name, startMatchId FROM season_stages WHERE seasonId = ? ORDER BY id', [competitionId]);
      const ranges = buildStageRanges(matches, stages);
      if (ranges.length !== stages.length) throw unavailable('Stage boundary references a missing match.');
      this.stageCache.set(competitionId, ranges);
    }
    return this.stageCache.get(competitionId);
  }

  async requireStage(competitionId, stageId) {
    await this.requireCatalog('competitions', competitionId);
    const range = (await this.stages(competitionId)).find(row => Number(row.id) === stageId);
    if (!range) throw notFound();
    return range;
  }

  async roster(competitionId, teamId) {
    const competition = await this.requireCatalog('competitions', competitionId);
    const team = await this.requireCatalog('teams', teamId);
    const membership = await this.select('SELECT id FROM season_teams WHERE seasonId = ? AND teamId = ?', [competitionId, teamId]);
    if (!membership.length) throw notFound();
    const players = await this.select(`SELECT c.id, c.name, c.role FROM players c WHERE EXISTS (
      SELECT 1 FROM season_team_players sp JOIN season_teams st ON st.id = sp.seasonTeamId
      WHERE sp.playerId = c.id AND st.seasonId = ? AND st.teamId = ?) ORDER BY c.id`, [competitionId, teamId]);
    return { competition: dto.ref(competition.id, competition.name), team: dto.ref(team.id, team.name), players: players.map(dto.player) };
  }

  async projectMatches(rows) {
    const byId = new Map();
    for (const competitionId of new Set(rows.map(row => Number(row.seasonId)))) {
      for (const stage of await this.stages(competitionId)) for (const matchId of stage.matchIds) byId.set(Number(matchId), stage);
    }
    return rows.map(row => dto.match(row, byId.get(Number(row.id))));
  }

  async matches(query, after, paginate = true) {
    const where = [], values = [];
    const add = (sql, ...params) => { where.push(sql); values.push(...params); };
    for (const [key, kind] of Object.entries({ competition_id: 'competitions', team_id: 'teams', opponent_id: 'teams', player_id: 'players', map_id: 'maps' })) {
      if (query[key]) await this.requireCatalog(kind, query[key]);
    }
    if (query.competition_id) add('m.seasonId = ?', query.competition_id);
    if (query.stage_id) {
      const stage = await this.requireStage(query.competition_id, query.stage_id);
      if (!stage.matchIds.length) return [];
      add(`m.id IN (${placeholders(stage.matchIds)})`, ...stage.matchIds);
    }
    if (query.team_id) add('(m.team1Id = ? OR m.team2Id = ?)', query.team_id, query.team_id);
    if (query.opponent_id) add('(m.team1Id = ? OR m.team2Id = ?)', query.opponent_id, query.opponent_id);
    if (query.date_from) add('m.matchDate >= ?', query.date_from);
    if (query.date_to) add('m.matchDate <= ?', query.date_to);
    if (query.map_id || query.player_id) {
      const filters = ['g.matchId = m.id'], params = [];
      if (query.map_id) { filters.push('g.mapId = ?'); params.push(query.map_id); }
      if (query.player_id) {
        filters.push(`EXISTS (SELECT 1 FROM player_stats ps WHERE ps.mapGameId = g.id AND ps.playerId = ?${query.team_id ? ' AND ps.teamId = ?' : ''})`);
        params.push(query.player_id);
        if (query.team_id) params.push(query.team_id);
      }
      add(`EXISTS (SELECT 1 FROM map_games g WHERE ${filters.join(' AND ')})`, ...params);
    }
    if (after) add('(m.matchDate < ? OR (m.matchDate = ? AND m.id < ?))', after.date, after.date, after.id);
    const rows = await this.select(`${MATCH_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY m.matchDate DESC, m.id DESC${paginate ? ` LIMIT ${query.limit + 1}` : ''}`, values);
    return this.projectMatches(rows);
  }

  async match(matchId) {
    const rows = await this.select(`${MATCH_SELECT} WHERE m.id = ?`, [matchId]);
    if (!rows.length) throw notFound();
    return (await this.projectMatches(rows))[0];
  }

  async gameData(matches, gameId) {
    if (!matches.length) return [];
    const parents = new Map(matches.map(row => [row.id, row]));
    const ids = [...parents.keys()];
    const games = await this.select(`${GAME_SELECT} WHERE g.matchId IN (${placeholders(ids)})${gameId ? ' AND g.id = ?' : ''}
      ORDER BY g.matchId, g.externalRoundIndex IS NULL, g.externalRoundIndex, g.id`, [...ids, ...(gameId ? [gameId] : [])]);
    if (gameId && !games.length) throw notFound();
    if (!games.length) return [];
    const gameIds = games.map(row => Number(row.id));
    const stats = await this.select(`SELECT ps.id, ps.mapGameId, ps.teamId, t.name AS teamName,
      ps.playerId, p.name AS playerName, p.role AS playerRole, ps.kills, ps.assists, ps.deaths, ps.damage, ps.healing, ps.mitigation
      FROM player_stats ps LEFT JOIN players p ON p.id = ps.playerId LEFT JOIN teams t ON t.id = ps.teamId
      WHERE ps.mapGameId IN (${placeholders(gameIds)}) ORDER BY ps.mapGameId, ps.teamId, ps.playerId, ps.id`, gameIds);
    const heroes = stats.length ? await this.select(`SELECT hs.playerStatId, hs.heroId, hs.heroName, h.name AS catalogHeroName,
      hs.usageSeconds, hs.usagePercentage, hs.finalBlows, hs.deathsByFinalBlow, hs.ultReady, hs.ultUsed, hs.avgUltChargeSeconds
      FROM player_hero_stats hs JOIN player_stats ps ON ps.id = hs.playerStatId LEFT JOIN heroes h ON h.id = hs.heroId
      WHERE ps.mapGameId IN (${placeholders(gameIds)}) ORDER BY hs.playerStatId, hs.usageSeconds DESC, hs.heroName, hs.id`, gameIds) : [];
    const statsByGame = grouped(stats, 'mapGameId'), heroesByStat = grouped(heroes, 'playerStatId');
    return games.map(row => {
      const playerStats = (statsByGame.get(Number(row.id)) || []).map(stat => dto.playerStat(stat, heroesByStat.get(Number(stat.id)) || []));
      return { game: dto.game(row, parents.get(Number(row.matchId)), playerStats), player_stats: playerStats };
    });
  }

  async scheduleCatalogs() {
    const competitions = await this.select('SELECT id, name, externalEventName FROM seasons ORDER BY id');
    const rows = await this.select('SELECT id, name FROM teams ORDER BY id');
    const aliases = await this.aliases(rows.map(row => row.id));
    const teams = rows.map(row => dto.team(row, (aliases.get(Number(row.id)) || []).map(a => a.alias)));
    return { competitions, teams };
  }
}

module.exports = { PublicDataRepository };
