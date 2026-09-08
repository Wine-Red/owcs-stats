const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createDataRouter } = require('../routes/data-v1');

const serverFor = async (t, options) => {
  const app = express();
  app.use('/data/v1', createDataRouter(options));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/data/v1`;
};

test('HTTP methods, parameter errors and missing paths use JSON contract without querying data', async t => {
  const base = await serverFor(t, { service: {}, logError: () => {} });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await fetch(`${base}/matches`, { method, ...(method === 'POST' ? { body: '{bad json', headers: { 'Content-Type': 'application/json' } } : {}) });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
    assert.equal((await response.json()).error.code, 'METHOD_NOT_ALLOWED');
  }
  for (const path of ['/matches?unknown=x', '/matches?limit=1&limit=2', '/matches/0', '/matches/%E0%A4%A', '/matches/1/games/1?player_id=2']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 400, path);
    assert.equal((await response.json()).error.code, 'INVALID_ARGUMENT');
  }
  for (const path of ['/sql', '/matches/1/', '/Matches']) assert.equal((await fetch(base + path)).status, 404);
  const head = await fetch(`${base}/matches/0`, { method: 'HEAD' });
  assert.equal(head.status, 400);
  assert.equal(await head.text(), '');
});

test('ETags follow the entire public body; HEAD and conditional reads have no body', async t => {
  let label = 'A';
  const base = await serverFor(t, { service: { catalog: async () => ({ data: [{ id: 1, name: label, aliases: [] }], pagination: { next_cursor: null } }) } });
  const first = await fetch(`${base}/teams`, { headers: { 'X-Request-Id': 'untrusted' } });
  const etag = first.headers.get('etag');
  assert.match(etag, /^W\/"[a-f0-9]{64}"$/);
  assert.notEqual(first.headers.get('x-request-id'), 'untrusted');
  assert.equal(first.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  const bytes = Buffer.byteLength(await first.text());
  const head = await fetch(`${base}/teams`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers.get('content-length')), bytes);
  assert.equal(await head.text(), '');
  for (const method of ['GET', 'HEAD']) {
    const cached = await fetch(`${base}/teams`, { method, headers: { 'If-None-Match': etag } });
    assert.equal(cached.status, 304);
    assert.equal(await cached.text(), '');
  }
  label = 'Renamed';
  const changed = await fetch(`${base}/teams`, { headers: { 'If-None-Match': etag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('etag'), etag);
});

test('rate limit returns Retry-After; unexpected failures do not disclose SQL', async t => {
  const base = await serverFor(t, { requestsPerMinute: 1, service: { matches: async () => { throw new Error('SELECT secret FROM configs'); } }, logError: () => {} });
  const error = await fetch(`${base}/matches`);
  assert.equal(error.status, 500);
  assert.equal(error.headers.get('cache-control'), 'no-store');
  assert.equal(error.headers.get('etag'), null);
  assert.deepEqual(await error.json(), { error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } });
  const limited = await fetch(`${base}/matches`);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('application mount precedes global JSON parsing and CORS', async t => {
  const app = require('../app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/data/v1/teams`, { method: 'OPTIONS' })).status, 405);
  assert.equal((await fetch(`${base}/DATA/V1/teams`)).status, 404);
  const write = await fetch(`${base}/data/v1/teams`, { method: 'POST', body: '{bad', headers: { 'Content-Type': 'application/json' } });
  assert.equal(write.status, 405);
  assert.equal((await write.json()).error.code, 'METHOD_NOT_ALLOWED');
  for (const route of ['/agent/v1/meta', '/agent/v1/seasons', '/agent/v1/matches/1', '/agent/v1/matches/1/map-games/1/player-stats', '/agent/v1/upcoming-matches']) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const removed = await fetch(base + route, { method });
      assert.equal(removed.status, 404, `${method} ${route}`);
      if (method === 'HEAD') assert.equal(await removed.text(), '');
    }
  }
});
