import { CONTEXT_FIELDS, EVENTS, FIELDS, PAGES, SCHEMA_VERSION, label } from './catalog.mjs';
const scalar = value => typeof value === 'string' ? value.trim().slice(0, 160)
  : typeof value === 'boolean' ? value : typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const present = value => value !== undefined && value !== null && value !== '';
const list = value => Array.isArray(value) ? value : [];
const find = (rows, id) => list(rows).find(row => present(id) && String(row.id) === String(id));
export function shouldCollect({ production, displayPackage, override, hostname, optedOut }) {
  if (displayPackage || optedOut || override === 'false') return false;
  return override === 'true' || (Boolean(production) && !/^(localhost|127\.|\[::1\])/.test(hostname));
}
export function pagePath(route, base = '') {
  let path = typeof route === 'string' ? route : route?.path || '';
  path = path.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  const prefix = base.replace(/\/$/, '');
  if (prefix && path.startsWith(`${prefix}/`)) path = path.slice(prefix.length);
  return path;
}
export const pageInfo = (route, base) => PAGES[pagePath(route, base)];
// UI query changes must not inflate pageviews; navigating to a different entity must.
export function visitKey(route) {
  const path = pagePath(route);
  const fields = path.endsWith('match-detail') ? ['matchId'] : path.endsWith('team-detail') ? ['teamId']
    : path.endsWith('player-detail') ? ['playerId'] : path.endsWith('upcoming-match') ? ['seasonId', 'sourceId', 'team1', 'team2', 'time'] : [];
  return `${path}:${fields.map(key => String(route?.query?.[key] || '')).join('|')}`;
}
export const snapshotRoute = route => ({ path: pagePath(route), query: { ...route?.query } });
export function enrichContext(input = {}, state = {}) {
  const result = { ...input };
  if (typeof input.duration === 'number' && Number.isFinite(input.duration) && input.duration >= 0) {
    result.durationBucket = input.duration < 1000 ? '1秒以内' : input.duration < 3000 ? '1至3秒'
      : input.duration < 10000 ? '3至10秒' : input.duration < 30000 ? '10至30秒' : '30秒以上';
  }
  for (const [field, collection] of [['season', 'seasons'], ['team', 'teams'], ['team1', 'teams'], ['team2', 'teams'], ['player', 'players'], ['hero', 'heroes'], ['map', 'maps']]) {
    const entity = find(state[collection], result[`${field}Id`]);
    if (!result[`${field}Name`] && entity?.name) result[`${field}Name`] = entity.name;
    if (field === 'season' && !result.stage && entity?.stage) result.stage = entity.stage;
  }
  if (!result.matchName && (result.team1Name || result.team2Name)) result.matchName = `${result.team1Name || '待定'} vs ${result.team2Name || '待定'}`;
  for (const field of ['season', 'match', 'team', 'player', 'hero', 'map']) {
    if (present(result[`${field}Id`]) && !result[`${field}Name`]) result[`${field}Name`] = '名称未解析';
  }
  for (const [key, collection] of [['teamIds', 'teams'], ['playerIds', 'players']]) {
    if (Array.isArray(result[key]) && result.selectionCount === undefined) result.selectionCount = result[key].length;
    if (Array.isArray(result[key])) result[key] = result[key].length
      ? result[key].slice(0, 8).map(id => find(state[collection], id)?.name || '名称未解析').join('、') : '全部';
  }
  if (Array.isArray(result.playerNames)) result.playerNames = result.playerNames.filter(present).slice(0, 8).join(' vs ');
  return result;
}
export function eventData(key, input, state, page, environment = '正式站') {
  const definition = EVENTS[key];
  if (!definition || !page) return null;
  const values = enrichContext(input, state);
  const data = { '口径版本': SCHEMA_VERSION, '页面': page.label, '站点版本': environment };
  for (const key of new Set([...CONTEXT_FIELDS, ...definition.fields])) {
    let value = values[key];
    if (!present(value)) continue;
    if (key.endsWith('Id')) value = String(value);
    if (key === 'matchDate') {
      const raw = String(value);
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) value = raw.slice(0, 10);
      else {
        const date = new Date(Number(raw) * (Number(raw) < 1e11 ? 1000 : 1));
        value = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(date) : '日期未解析';
      }
    }
    if (['tab', 'category', 'mode', 'source', 'filter', 'value', 'role', 'metric', 'order', 'eventType', 'outcome', 'action', 'type', 'inputType', 'errorType'].includes(key)) value = label(value);
    value = scalar(value);
    if (present(value) && FIELDS[key]) data[FIELDS[key]] = value;
  }
  return data;
}
export function routeContext(route) {
  const query = route?.query || {}, result = {};
  // Names in query strings are not trusted content. Resolve IDs from app data.
  for (const key of ['seasonId', 'matchId', 'teamId', 'playerId', 'team1Id', 'team2Id']) {
    if (/^\d+$/.test(String(query[key] || ''))) result[key] = String(query[key]);
  }
  return result;
}
export function safeReferrer(value, origin) {
  if (!value) return '';
  try {
    const url = new URL(value, origin);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin === origin ? (pageInfo(url.pathname) ? url.pathname : '') : url.origin;
  } catch { return ''; }
}
export function campaignQuery(search = '') {
  const query = new URLSearchParams(search), clean = new URLSearchParams();
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = query.get(key);
    if (value && /^[\p{L}\p{N} _.-]{1,80}$/u.test(value)) clean.set(key, value);
  }
  return clean.size ? `?${clean}` : '';
}
export function classifyError(error) {
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || error?.name === 'TimeoutError') return 'timeout';
  if (error?.response?.status || error?.status) return 'http';
  if (error?.name === 'TypeError' || error?.code === 'ERR_NETWORK') return 'network';
  return 'unknown';
}
export function apiResource(value) {
  const path = String(value || '').split('?')[0];
  const names = [['timeline', '比赛时间线'], ['season-stats', '赛季统计'], ['stats/player', '选手统计'], ['stats/hero', '英雄统计'], ['stats/team', '战队统计'], ['map-games', '地图局数据'], ['matches', '比赛数据'], ['seasons', '赛事列表'], ['teams', '战队资料'], ['players', '选手资料'], ['heroes', '英雄资料'], ['maps', '地图资料'], ['config', '页面配置']];
  return names.find(([part]) => path.includes(part))?.[1] || '公共数据接口';
}
// Each queued item captures its page before navigation. No persistent storage/retry.
export function createTransport({ getTracker, enabled = () => true, now = Date.now, debug, limit = 100, ttl = 60000 }) {
  const queue = [];
  let flushing = false;
  const flush = () => {
    if (!enabled()) { queue.length = 0; return; }
    const tracker = getTracker();
    if (!tracker?.track || flushing) return;
    flushing = true;
    try {
      while (queue.length) {
        const item = queue.shift();
        if (now() - item.at > ttl) continue;
        try { Promise.resolve(tracker.track(defaults => ({ ...defaults, ...item.payload }))).catch(() => {}); }
        catch { /* Telemetry must never affect the product. */ }
      }
    } finally { flushing = false; }
  };
  return {
    send(payload) {
      debug?.(payload);
      if (!enabled()) return false;
      if (queue.length >= limit) queue.shift();
      queue.push({ payload: JSON.parse(JSON.stringify(payload)), at: now() });
      flush();
      return true;
    },
    flush, clear: () => { queue.length = 0; },
    get pending() { return queue.length; },
  };
}
