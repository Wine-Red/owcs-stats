const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { createSiteRouter } = require('../routes/site-v1');
const { routes } = require('../services/siteApi/contract');

test('metadata detects edits without timestamps, deletions, media changes and timelines; private config stays irrelevant', async () => {
  const { sourceNames, readMetadata } = require('../services/siteApi/metadata');
  const rows = Object.fromEntries(sourceNames.map(name => [name, [{ id: 1, value: 1 }]]));
  rows.Config = [{ key: 'private_secret', value: 'private' }, { key: 'visualize_chart_config', value: { futureField: 1 } }];
  rows.MapGameTimeline = [{ id: 1, mapGameId: 1, digest: 'first', revision: 1, payload: { secret: 'not loaded' } }];
  const transaction = {}, calls = [];
  const models = Object.fromEntries(Object.entries(rows).map(([name, data]) => [name, {
    rawAttributes: Object.fromEntries(Object.keys(data[0]).map(key => [key, {}])),
    async findAll(options) {
      assert.equal(options.transaction, transaction); calls.push({ name, attributes: options.attributes });
      return rows[name].map(row => Object.fromEntries(options.attributes.map(key => [key, row[key]])));
    }
  }]));
  const options = { database: { transaction: async (_options, fn) => fn(transaction) }, models,
    readSchedule: async () => ({ data: [], observedAt: Date.now(), stale: false }) };
  const first = await readMetadata(options);
  assert.equal((await readMetadata(options)).revision, first.revision);
  rows.Config[0].value = 'another private value';
  assert.equal((await readMetadata(options)).revision, first.revision);
  for (const change of [() => { rows.PlayerStat[0].value++; }, () => { rows.SeasonTeam.length = 0; },
    () => { rows.Team[0].value = 'new-image'; }, () => { rows.MapGameTimeline[0].digest = 'second'; },
    () => { rows.Config[1].value.futureField++; }]) {
    const before = (await readMetadata(options)).revision; change();
    assert.notEqual((await readMetadata(options)).revision, before);
  }
  assert.ok(calls.filter(call => call.name === 'MapGameTimeline').every(call => !call.attributes.includes('payload')));
  assert.equal(JSON.stringify(first).includes('private'), false);
});

const serve = async (t, options) => {
  const app = express(); app.use('/public-api/site/v1', createSiteRouter(options));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/public-api/site/v1`;
};
test('all public routes reuse their controller, validate IDs/queries and deny management routes', async t => {
  let calls = 0;
  const base = await serve(t, { resolve: (controller, method) => (_req, res) => { calls++; res.json({ controller, method }); } });
  for (const [route, controller, method] of routes) {
    const path = route.replace(':key', 'visualize_chart_config').replace(/:[a-zA-Z]+/g, '1');
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path); assert.deepEqual(await response.json(), { controller, method });
  }
  assert.equal(calls, routes.length);
  for (const path of ['/config', '/config/private_secret', '/seasons/1/pre-delete-check', '/teams/1/admin-context', '/static-export/snapshot']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  }
  for (const path of ['/seasons/NaN', '/matches?pageSize=10001', '/matches?unknown=1', '/matches?seasonId=1&seasonId=2', '/matches?startDate=nope', '/matches?startDate=2026-02-31', '/matches?startDate=2026-09-09&endDate=2026-09-01']) {
    assert.equal((await fetch(`${base}${path}`)).status, 400, path);
  }
});
test('CORS, preflight, ETag/304, HEAD, writes and rate limits have the same public boundary', async t => {
  let calls = 0, time = 0;
  const base = await serve(t, { now: () => time, requestsPerMinute: 8, resolve: () => (_req, res) => { calls++; res.json({ revision: calls }); } });
  const options = await fetch(`${base}/seasons`, { method: 'OPTIONS', headers: { Origin: 'https://partner.test', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'If-None-Match' } });
  assert.equal(options.status, 204); assert.equal(options.headers.get('access-control-allow-origin'), '*');
  assert.equal(options.headers.get('access-control-allow-credentials'), null);
  const response = await fetch(`${base}/seasons`); const etag = response.headers.get('etag');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal((await fetch(`${base}/seasons`, { headers: { 'If-None-Match': etag } })).status, 304);
  const head = await fetch(`${base}/seasons`, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal(calls, 1);
  time = 15001;
  const changed = await fetch(`${base}/seasons`, { headers: { 'If-None-Match': etag } });
  assert.equal(changed.status, 200); assert.notEqual(changed.headers.get('etag'), etag);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const write = await fetch(`${base}/seasons`, { method }); assert.equal(write.status, 405); assert.equal(write.headers.get('access-control-allow-origin'), '*');
  }
  for (let i = 0; i < 4; i++) await fetch(`${base}/seasons`);
  const limited = await fetch(`${base}/seasons`); assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
});
test('errors are not cached or leaked and identical in-flight reads are merged', async t => {
  let calls = 0, broken = true;
  const base = await serve(t, { resolve: () => async (_req, res) => {
    calls++; await new Promise(resolve => setTimeout(resolve, 20));
    res.status(broken ? 500 : 200).json(broken ? { error: 'SQL secret' } : { data: [1] });
  } });
  const results = await Promise.all([fetch(`${base}/teams`), fetch(`${base}/teams`)]);
  assert.equal(calls, 1); assert.equal(results[0].status, 500); assert.equal((await results[0].text()).includes('SQL'), false);
  broken = false; assert.equal((await fetch(`${base}/teams`)).status, 200); assert.equal(calls, 2);
});
