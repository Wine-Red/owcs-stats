import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { EVENTS, FIELDS, PAGES } from './catalog.mjs';
import { apiResource, campaignQuery, classifyError, createTransport, enrichContext, eventData, pageInfo, routeContext, safeReferrer, shouldCollect, snapshotRoute, visitKey } from './core.mjs';

const state = { seasons: [{ id: 24, name: 'OWCS 中国赛区', stage: '2026 第三赛段' }], teams: [{ id: 1, name: 'Weibo Gaming' }, { id: 2, name: 'JD Gaming' }], players: [{ id: 7, name: 'SHY' }], maps: [{ id: 10, name: '尼泊尔' }] };
test('collection policy isolates development, opt-out, disabled and partner builds', () => {
  assert.equal(shouldCollect({ production: true, hostname: 'stats.owmini.xyz' }), true);
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) assert.equal(shouldCollect({ production: true, hostname }), false);
  assert.equal(shouldCollect({ production: false, hostname: 'dev.test' }), false);
  assert.equal(shouldCollect({ production: false, hostname: 'localhost', override: 'true' }), true);
  for (const config of [{ displayPackage: true, override: 'true' }, { optedOut: true, override: 'true' }, { override: 'false' }]) assert.equal(shouldCollect({ production: true, hostname: 'stats.test', ...config }), false);
});
test('public allowlist includes players, ignores admin and forged route metadata', () => {
  assert.equal(pageInfo('/stats/visualize/player-detail?playerId=7', '/stats/')?.label, '选手详情');
  for (const path of ['/analytics', '/data-manage', '/dashboard', '/visualize/unknown']) assert.equal(pageInfo({ path, meta: { analyticsPage: 'visualize_home' } }), undefined);
});
test('UI tabs and season filters do not count as navigations; entity switches do', () => {
  const first = { path: '/visualize/player-detail', query: { playerId: '7', seasonId: '24', tab: 'overview' } };
  assert.equal(visitKey(first), visitKey({ ...first, query: { ...first.query, tab: 'heroes', seasonId: '25' } }));
  assert.notEqual(visitKey(first), visitKey({ ...first, query: { playerId: '8' } }));
  const upcoming = { path: '/visualize/upcoming-match', query: { team1: 'A', team2: 'B', time: '2026-09-26' } };
  assert.notEqual(visitKey(upcoming), visitKey({ ...upcoming, query: { ...upcoming.query, time: '2026-09-27' } }));
});
test('route snapshot is independent from subsequent query mutations', () => {
  const route = { path: '/visualize/player-detail', query: { playerId: '7' } }, captured = snapshotRoute(route);
  route.query.playerId = '9'; route.path = '/dashboard';
  assert.equal(captured.query.playerId, '7'); assert.equal(captured.path, '/visualize/player-detail');
});
test('names resolve from public application data with string and numeric IDs', () => {
  const result = enrichContext({ seasonId: '24', team1Id: 1, team2Id: '2', playerId: 7, mapId: '10', teamIds: [1, 2], playerIds: [] }, state);
  assert.equal(result.seasonName, 'OWCS 中国赛区'); assert.equal(result.stage, '2026 第三赛段');
  assert.equal(result.matchName, 'Weibo Gaming vs JD Gaming'); assert.equal(result.playerName, 'SHY');
  assert.equal(result.mapName, '尼泊尔'); assert.equal(result.teamIds, 'Weibo Gaming、JD Gaming'); assert.equal(result.playerIds, '全部');
});
test('explicit API names survive; missing names are never rendered as naked IDs', () => {
  assert.equal(enrichContext({ playerId: 7, playerName: 'Updated name' }, state).playerName, 'Updated name');
  assert.equal(enrichContext({ matchId: 99 }).matchName, '名称未解析');
});
test('payload is readable, bounded and drops arbitrary private data', () => {
  const data = eventData('filter_change', { seasonId: 24, feature: '选手排行榜', role: 'tank', resultCount: 0, email: 'private@example.com', message: 'private prompt', token: 'secret', value: 'x'.repeat(800), playerIds: [7] }, state, PAGES['/visualize']);
  assert.equal(data['职责'], '重装'); assert.equal(data['赛事'], 'OWCS 中国赛区'); assert.equal(data['结果数量'], 0);
  assert.equal(data['筛选值'].length, 160); assert.equal(data['筛选选手'], 'SHY');
  assert.doesNotMatch(JSON.stringify(data), /private|secret/);
  assert.equal(eventData('unregistered', {}, {}, PAGES['/visualize']), null);
  assert.equal(eventData('filter_change', {}, {}, undefined), null);
});
test('numbers and false survive, missing values are not converted to zero', () => {
  const data = eventData('export_result', { transparent: false, duration: 0, firstTextMs: null, outcome: 'preview' }, {}, PAGES['/visualize']);
  assert.equal(data['透明背景'], false); assert.equal(data['耗时毫秒'], 0); assert.equal(data['结果'], '预览已生成');
  assert.equal(data['耗时区间'], '1秒以内');
  assert.equal(eventData('assistant_result', { duration: NaN, firstTextMs: null }, {}, PAGES['/visualize'])['首字毫秒'], undefined);
});
test('entity IDs have a single type; match dates are readable calendar dates', () => {
  const data = eventData('open_match', { matchId: 7, seasonId: '24', matchDate: 1790344800 }, state, PAGES['/visualize']);
  assert.equal(data['比赛ID'], '7'); assert.equal(data['赛事ID'], '24');
  assert.match(data['比赛日期'], /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(eventData('open_match', { matchDate: '2026-09-20T08:30:00Z' }, {}, PAGES['/visualize'])['比赛日期'], '2026-09-20');
});
test('error data uses resource categories; raw error URLs and text cannot escape', () => {
  assert.equal(apiResource('/matches/41/map-games?token=secret'), '地图局数据');
  assert.equal(classifyError({ response: { status: 500 } }), 'http');
  assert.equal(classifyError({ code: 'ECONNABORTED' }), 'timeout');
  assert.equal(classifyError(new TypeError()), 'network');
  const data = eventData('api_error', { url: '/private?token=secret', message: 'sensitive', resource: '比赛数据', status: 500 }, {}, PAGES['/visualize']);
  assert.doesNotMatch(JSON.stringify(data), /secret|sensitive/);
});
test('query context ignores arbitrary names and only accepts numeric entity IDs', () => {
  assert.deepEqual(routeContext({ query: { playerId: '7', teamId: 'x', team1: 'email@example.com', token: 'secret', from: 'private' } }), { playerId: '7' });
});
test('acquisition keeps only safe UTM labels and strips referrer queries', () => {
  assert.equal(campaignQuery('?utm_source=bilibili&utm_campaign=OWCS%202026&token=secret&team1Logo=https://image'), '?utm_source=bilibili&utm_campaign=OWCS+2026');
  assert.equal(campaignQuery('?utm_campaign=me%40example.com&utm_medium=https://private'), '');
  assert.equal(safeReferrer('https://external.test/private?q=secret', 'https://stats.test'), 'https://external.test');
  assert.equal(safeReferrer('https://stats.test/visualize?secret=x', 'https://stats.test'), '/visualize');
  assert.equal(safeReferrer('https://stats.test/data-manage?secret=x', 'https://stats.test'), '');
  assert.equal(safeReferrer('', 'https://stats.test'), '');
});
test('delayed SDK flush retains original URLs and immutable data, in order', () => {
  let tracker; const sent = [];
  const transport = createTransport({ getTracker: () => tracker });
  const payload = { url: '/visualize', title: '赛事首页', data: { '赛事': 'A' } };
  transport.send(payload); payload.data['赛事'] = 'B';
  transport.send({ url: '/visualize/player-detail', name: '导航-打开选手' });
  tracker = { track(fn) { sent.push(fn({ website: 'site-id', url: '/dashboard' })); return Promise.resolve(); } };
  transport.flush(); transport.flush();
  assert.equal(sent.length, 2); assert.equal(sent[0].url, '/visualize'); assert.equal(sent[0].data['赛事'], 'A'); assert.equal(sent[0].website, 'site-id');
});
test('queue overflow/expiry and opt-out cannot cause unbounded storage or stale sends', () => {
  let tracker, clock = 0, enabled = true; const sent = [];
  const transport = createTransport({ getTracker: () => tracker, now: () => clock, enabled: () => enabled, limit: 2, ttl: 100 });
  transport.send({ n: 1 }); transport.send({ n: 2 }); transport.send({ n: 3 }); assert.equal(transport.pending, 2);
  clock = 101; tracker = { track: f => sent.push(f({})) }; transport.flush(); assert.equal(sent.length, 0);
  enabled = false; assert.equal(transport.send({ n: 4 }), false); assert.equal(transport.pending, 0);
});
test('SDK exceptions and rejected promises do not escape tracking', async () => {
  for (const track of [() => { throw new Error('blocked'); }, () => Promise.reject(new Error('blocked'))]) {
    const transport = createTransport({ getTracker: () => ({ track }) });
    assert.doesNotThrow(() => transport.send({ name: 'sample' }));
  }
  await new Promise(resolve => setImmediate(resolve));
});
test('catalog names are unique and all declared dimensions are supported', () => {
  assert.equal(new Set(Object.values(EVENTS).map(event => event.name)).size, Object.keys(EVENTS).length);
  for (const event of Object.values(EVENTS)) {
    assert.ok(event.name.length <= 50); assert.ok(event.purpose);
    for (const key of event.fields) assert.ok(FIELDS[key], `Missing field label: ${key}`);
  }
});
test('all literal instrumentation calls are registered; raw SDK use stays centralized', async () => {
  async function walk(url) { const entries = await readdir(url, { withFileTypes: true }); return (await Promise.all(entries.map(item => item.isDirectory() ? walk(new URL(`${item.name}/`, url)) : new URL(item.name, url)))).flat(); }
  const files = await walk(new URL('../', import.meta.url));
  for (const file of files.filter(file => /\.(?:vue|js)$/.test(file.pathname))) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:trackPublicEvent|\btrack)\('([^']+)'/g)) assert.ok(EVENTS[match[1]], `${file.pathname}: ${match[1]} is not registered`);
    if (!file.pathname.endsWith('/utils/analytics.js')) assert.doesNotMatch(source, /window\.umami/);
  }
});
