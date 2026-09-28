const test = require('node:test');
const assert = require('node:assert/strict');

function loadWithStubs(moduleName, stubs) {
  const target = require.resolve(moduleName), saved = new Map();
  for (const [name, exports] of Object.entries(stubs)) {
    const filename = require.resolve(name);
    saved.set(filename, require.cache[filename]);
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
  }
  saved.set(target, require.cache[target]); delete require.cache[target];
  return { module: require(target), restore() {
    for (const [filename, cached] of saved) {
      if (cached) require.cache[filename] = cached; else delete require.cache[filename];
    }
  } };
}

test('saving season configuration wakes synchronization only after persistence succeeds', async t => {
  t.mock.method(console, 'log', () => {}); t.mock.method(console, 'error', () => {});
  let wakes = 0, persisted = false, fail = false;
  const record = { changed() {}, toJSON() { return { key: 'visualize_season_1' }; }, async save() {
    if (fail) throw new Error('Write failed'); persisted = true;
  } };
  const loaded = loadWithStubs('../controllers/ConfigController', {
    '../models/Config': { findOrCreate: async () => [record, false] },
    '../services/TournamentRuntime': { wakeTournamentSync: () => { assert.equal(persisted, true); wakes++; } }
  });
  t.after(loaded.restore);
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {} };
  await loaded.module.updateConfig({ body: { key: 'visualize_season_1', value: { liquipediaTournamentUrl: 'https://liquipedia.net/overwatch/Test' } } }, response);
  assert.equal(wakes, 1);
  await loaded.module.updateConfig({ body: { key: 'unrelated_setting', value: {} } }, response);
  assert.equal(wakes, 1);
  fail = true; persisted = false;
  await loaded.module.updateConfig({ body: { key: 'visualize_season_1', value: {} } }, response);
  assert.equal(response.statusCode, 500);
  assert.equal(wakes, 1);
});

test('runtime is idle on import and GET setup; explicit server startup starts exactly one worker', async t => {
  let starts = 0, wakes = 0, stopped = 0, services = 0;
  const prior = process.env.TOURNAMENT_SYNC_DISABLED;
  t.after(() => { if (prior === undefined) delete process.env.TOURNAMENT_SYNC_DISABLED; else process.env.TOURNAMENT_SYNC_DISABLED = prior; });
  const loaded = loadWithStubs('../services/TournamentRuntime', {
    '../services/LiquipediaTournamentService': { createTournamentService: () => { services++; return {}; } },
    '../services/TournamentSyncScheduler': { createTournamentScheduler: () => ({ start() { starts++; }, wake() { wakes++; }, async stop() { stopped++; } }) },
    '../models/Season': {}, '../models/Config': {}
  });
  t.after(loaded.restore);
  const runtime = loaded.module;
  runtime.wakeTournamentSync(); runtime.getTournamentService();
  assert.equal(starts, 0); assert.equal(wakes, 0); assert.equal(services, 1);
  process.env.TOURNAMENT_SYNC_DISABLED = '1'; runtime.startTournamentSync();
  assert.equal(starts, 0);
  delete process.env.TOURNAMENT_SYNC_DISABLED;
  runtime.startTournamentSync(); runtime.startTournamentSync(); runtime.wakeTournamentSync();
  assert.equal(starts, 1); assert.equal(wakes, 1); assert.equal(services, 1);
  await runtime.stopTournamentSync(); assert.equal(stopped, 1);
});
