const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Config = require('../models/Config');
const settings = require('../services/MatchPollSettingsService');
const ConfigController = require('../controllers/ConfigController');
const { createPollRouter } = require('../routes/polls');

test('voting defaults to enabled and reads persisted settings without a stale cache', async t => {
  let stored = null;
  t.mock.method(Config, 'findByPk', async key => { assert.equal(key, settings.configKey); return stored; });
  assert.deepEqual(await settings.getStatus(), { enabled: true });
  stored = { value: { enabled: false } };
  assert.deepEqual(await settings.getStatus(), { enabled: false });
  stored = { value: '{"enabled":true}' };
  assert.deepEqual(await settings.getStatus(), { enabled: true });
});

test('the management switch blocks both public writes, preserves counts and can re-enable voting', async t => {
  t.mock.method(console, 'log', () => {});
  let stored = null, identities = 0, votes = 0, writes = 0, unavailable = false;
  t.mock.method(Config, 'findByPk', async () => {
    if (unavailable) throw new Error('Settings unavailable');
    return stored;
  });
  t.mock.method(Config, 'findOrCreate', async ({ defaults }) => {
    writes++;
    if (!stored) {
      stored = { ...defaults, changed() {}, async save() {}, toJSON() { return { value: this.value }; } };
      return [stored, true];
    }
    return [stored, false];
  });
  const summary = { sources: { fixture: { total: 7, votes: { 1: 4, 2: 3 }, closed: false } }, matches: {} };
  const app = express();
  app.use(express.json());
  app.post('/api/config', ConfigController.updateConfig);
  app.use('/poll-api', createPollRouter({
    getSummary: async () => summary,
    createVisitor: async () => { identities++; return 'fixture-token'; },
    castVote: async () => { votes++; return summary; }
  }));
  app.use((_req, res) => res.sendStatus(404));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ error: 'Request failed' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://stats.owmini.xyz' }, body: JSON.stringify(data)
  });
  assert.deepEqual(await (await fetch(base + '/poll-api/status')).json(), { enabled: true });
  assert.equal((await post('/poll-api/visitor')).status, 200);
  for (const value of [null, false, {}, { enabled: 'false' }, { enabled: 0 }, { enabled: false, unrelated: true }]) {
    assert.equal((await post('/api/config', { key: settings.configKey, value })).status, 400);
  }
  assert.equal(writes, 0, 'invalid switches never reach persistence');
  assert.equal((await post('/api/config', { key: settings.configKey, value: { enabled: false } })).status, 200);
  assert.deepEqual(await (await fetch(base + '/poll-api/status')).json(), { enabled: false });
  for (const path of ['/visitor', '/vote']) {
    const response = await post('/poll-api' + path);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'VOTING_DISABLED');
  }
  assert.equal(identities, 1);
  assert.equal(votes, 0);
  const response = await fetch(base + '/poll-api/summary?seasonId=25');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const disabled = await response.json();
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.sources.fixture.total, 7);
  assert.equal(disabled.sources.fixture.closed, true);
  assert.equal(summary.sources.fixture.closed, false, 'shared results are not mutated');
  assert.equal((await post('/poll-api/status', { enabled: true })).status, 404, 'the public status cannot change settings');
  assert.equal((await post('/api/config', { key: settings.configKey, value: { enabled: true } })).status, 200);
  assert.equal((await post('/poll-api/visitor')).status, 200);
  assert.equal((await post('/poll-api/vote')).status, 200);
  assert.equal(identities, 2);
  assert.equal(votes, 1);
  unavailable = true;
  for (const path of ['/visitor', '/vote']) assert.equal((await post('/poll-api' + path)).status, 500);
  assert.equal(identities, 2, 'a settings failure cannot create identities');
  assert.equal(votes, 1, 'a settings failure cannot authorize votes');
});
