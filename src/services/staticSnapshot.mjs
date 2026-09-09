// Query complete resources instead of replaying a list of captured URLs.
import { timestampRange, withinTimestampRange } from '../../backend/shared/dateRange.mjs';
export const STATIC_SCHEMA_VERSION = 2;
export const staticError = (message, status = 404) => Object.assign(new Error(message), {
  code: 'STATIC_DATA_MISSING', response: { status }
});
const same = (a, b) => String(a) === String(b);
const required = (value, label) => {
  if (value === undefined || value === null) throw staticError(`静态数据缺失: ${label}`);
  return value;
};
const positive = (value, fallback) => {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw staticError('分页参数必须是正整数', 400);
  return Number(value);
};
export const parseStaticRequest = (path, params = {}) => {
  const url = new URL(path, 'https://static.invalid');
  if (url.origin !== 'https://static.invalid') throw staticError('静态数据请求必须使用相对接口路径', 400);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
};
export const readStaticData = async (load, path, params) => {
  const url = parseStaticRequest(path, params), pathname = url.pathname, query = url.searchParams;
  const check = (...allowed) => {
    for (const key of query.keys()) if (!allowed.includes(key)) throw staticError(`静态数据不支持参数 ${key}: ${pathname}`, 400);
  };
  const collection = name => load(`collections.${name}`);
  const view = (name, key) => load(`views.${name}${key === undefined ? '' : `.${key}`}`);
  const entity = async (name, id) => required((await collection(name)).find(row => same(row.id, id)), `${name}/${id}`);
  let match;
  if (pathname === '/matches/upcoming') { check(); return load('schedule'); }
  if ((match = pathname.match(/^\/(seasons|teams|players|maps|heroes|season-teams|season-team-players|player-stats)(?:\/(\d+))?$/))) {
    check();
    const name = { 'season-teams': 'seasonTeams', 'season-team-players': 'seasonTeamPlayers', 'player-stats': 'playerStats' }[match[1]] || match[1];
    return match[2] ? entity(name, match[2]) : collection(name);
  }
  if (pathname === '/matches' || pathname === '/map-games') {
    check('page', 'pageSize', 'seasonId', 'teamId', 'mapId', 'startDate', 'endDate');
    const isMatches = pathname === '/matches';
    let rows = await collection(isMatches ? 'matches' : 'mapGames');
    if (query.has('seasonId')) rows = rows.filter(row => same(row.seasonId, query.get('seasonId')));
    if (query.has('teamId')) rows = rows.filter(row => [row.team1Id, row.team2Id].some(id => same(id, query.get('teamId'))));
    if (query.has('mapId')) {
      const mapId = query.get('mapId');
      const ids = isMatches ? new Set((await collection('mapGames')).filter(row => same(row.mapId, mapId)).map(row => String(row.matchId))) : null;
      rows = rows.filter(row => isMatches ? ids.has(String(row.id)) : same(row.mapId, mapId));
    }
    if (isMatches) {
      if (query.has('startDate')) rows = rows.filter(row => String(row.matchDate || '').slice(0, 10) >= query.get('startDate'));
      if (query.has('endDate')) rows = rows.filter(row => String(row.matchDate || '').slice(0, 10) <= query.get('endDate'));
    } else {
      let range;
      try { range = timestampRange(Object.fromEntries(query)); }
      catch (error) { throw staticError(error.message, error.statusCode || 400); }
      rows = rows.filter(row => withinTimestampRange(row.createdAt, range)).sort((a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.id) - Number(a.id));
    }
    const total = rows.length, page = positive(query.get('page'), 1), size = positive(query.get('pageSize'), 10);
    rows = rows.slice((page - 1) * size, page * size);
    return isMatches ? { total, list: rows } : rows;
  }
  if ((match = pathname.match(/^\/matches\/(\d+)\/data$/))) { check(); return required(await view('matchData', match[1]), pathname); }
  if ((match = pathname.match(/^\/matches\/(\d+)(?:\/(map-games))?$/))) {
    check(); const parent = await entity('matches', match[1]);
    return match[2] ? (await collection('mapGames')).filter(row => same(row.matchId, parent.id)) : parent;
  }
  if ((match = pathname.match(/^\/map-games\/(\d+)(?:\/(player-stats))?$/))) {
    check(); const game = await entity('mapGames', match[1]);
    if (match[2]) return (await collection('playerStats')).filter(row => same(row.mapGameId, game.id));
    return game.timeline ? { ...game, timeline: await load(`timelines.${game.id}`) } : game;
  }
  if ((match = pathname.match(/^\/season-teams\/(\d+)\/players$/))) {
    check(); await entity('seasonTeams', match[1]);
    return (await collection('seasonTeamPlayers')).filter(row => same(row.seasonTeamId, match[1]));
  }
  if ((match = pathname.match(/^\/seasons\/(\d+)\/teams$/))) {
    check(); await entity('seasons', match[1]);
    const ids = new Set((await collection('seasonTeams')).filter(row => same(row.seasonId, match[1])).map(row => String(row.teamId)));
    return (await collection('teams')).filter(row => ids.has(String(row.id)));
  }
  if ((match = pathname.match(/^\/config\/(.+)$/))) { check(); return required((await view('config'))[decodeURIComponent(match[1])], pathname); }
  if ((match = pathname.match(/^\/season-stats\/(\d+)(?:\/(team-score|map-picks|features|stages))?$/))) {
    check('stageId'); const season = required(await view('seasonStats', match[1]), pathname);
    const field = { 'team-score': 'teamScore', 'map-picks': 'mapPicks', features: 'features', stages: 'stages' }[match[2]] || 'players';
    if (query.has('stageId')) {
      if (!['players', 'teamScore', 'mapPicks'].includes(field)) throw staticError('该统计不支持阶段筛选', 400);
      return required(season.stageStats?.[query.get('stageId')]?.[field], pathname);
    }
    return required(season[field], pathname);
  }
  if ((match = pathname.match(/^\/season-stats\/(\d+)\/teams\/(\d+)\/(compositions|hero-stats)$/))) {
    check('stageId');
    const season = await view('seasonStats', match[1]);
    const scope = query.has('stageId') ? season?.stageStats?.[query.get('stageId')] : season;
    const team = scope?.teams?.[match[2]];
    return required(team?.[match[3] === 'compositions' ? 'compositions' : 'heroStats'], pathname);
  }
  if ((match = pathname.match(/^\/stats\/player\/(\d+)\/profile$/))) {
    check('seasonId'); const profile = await view('playerProfiles', match[1]);
    return required(query.has('seasonId') ? profile?.bySeason?.[query.get('seasonId')] : profile?.all, pathname);
  }
  if (pathname === '/stats/hero/overview') { check('seasonId'); return required(await view('heroOverview', query.get('seasonId')), pathname); }
  if (pathname === '/stats/hero/players' || pathname === '/stats/player/heroes') {
    const isHero = pathname === '/stats/hero/players', id = isHero ? 'heroId' : 'playerId';
    check('seasonId', id);
    return required(await view(isHero ? 'heroPlayers' : 'playerHeroes', `${query.get('seasonId')}:${query.get(id)}`), pathname);
  }
  throw staticError(`静态数据不支持此读取: ${pathname}`);
};
