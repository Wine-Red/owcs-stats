const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { Sequelize } = require('sequelize');
const { defineTournamentSnapshot } = require('../database/tournamentSnapshotSchema');
const { createTournamentSnapshotStore, sourceKey } = require('../services/TournamentSnapshotStore');
const { createTournamentService } = require('../services/LiquipediaTournamentService');
const { parseTournamentUrl } = require('../services/LiquipediaRosterParser');
const sources = require('./fixtures/tournaments/sources.json');

test('MySQL snapshot persistence, concurrency, recovery and legacy migration', { skip: process.env.TOURNAMENT_TEST_MYSQL !== '1' }, async t => {
  const env = require('dotenv').parse(await fs.readFile(path.join(__dirname, '../.env')));
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(env.DB_HOST), 'Tests require loopback MySQL');
  assert.equal(env.DB_NAME, 'localstats', 'Only the local development database is permitted');
  const database = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
    host: env.DB_HOST, port: Number(env.DB_PORT || 3306), dialect: 'mysql', logging: false
  });
  // Only this newly-created test table is changed. Never sync business models.
  const tableName = `tournament_snapshots_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const model = defineTournamentSnapshot(database, { tableName });
  t.after(async () => { try { await model.drop(); } finally { await database.close(); } });
  await model.sync();
  const store = createTournamentSnapshotStore({ model });
  const root = { ...sources.china2, html: await fs.readFile(path.join(__dirname, 'fixtures/tournaments/china2.html'), 'utf8') };
  const child = { ...sources['china2-regular'], html: await fs.readFile(path.join(__dirname, 'fixtures/tournaments/china2-regular.html'), 'utf8') };
  const source = parseTournamentUrl(sources.china2.sourceUrl);
  let clock = Date.parse('2026-09-28T00:00:00Z'), calls = 0, broken = false;
  const options = { store, now: () => clock, legacyCacheDir: null, fetchCanonicalPages: async () => ({}),
    fetchPage: async ({ page }) => {
      calls++;
      if (page.endsWith('/Regular Season')) { if (broken) throw new Error('Child unavailable'); return child; }
      return root;
    } };
  const service = createTournamentService(options);

  await t.test('two workers publish one complete snapshot; reads never initiate synchronization', async () => {
    assert.equal((await service.get(source.url, {})).loading, true);
    assert.equal(await model.count(), 0);
    assert.equal(calls, 0);
    const otherWorker = createTournamentService(options);
    const results = await Promise.all([service.sync(source.url), otherWorker.sync(source.url)]);
    assert.equal(results.filter(r => r.saved).length, 1);
    assert.equal(results.filter(r => r.skipped).length, 1);
    assert.equal(calls, 2);
    const row = await store.read(source.page);
    assert.equal(row.payload.blocks.flatMap(b => b.matches || []).length, 36);
    assert.equal(row.payload.sources.length, 2);
    assert.ok(row.contentHash);
    assert.equal(row.syncToken, null);
    const restarted = createTournamentService(options);
    assert.deepEqual((await restarted.get(source.url, {})).blocks, row.payload.blocks);
    for (let i = 0; i < 5; i++) await restarted.get(source.url, {});
    assert.equal(calls, 2);
    assert.equal(await model.count(), 1);
  });

  await t.test('failed child preserves the full last success, uses persisted backoff, then recovers', async () => {
    const first = await store.read(source.page);
    clock += 300001; broken = true;
    assert.match((await service.sync(source.url)).error, /Child unavailable/);
    const failed = await store.read(source.page);
    assert.deepEqual(failed.payload, first.payload);
    assert.equal(+failed.lastSuccessAt, +first.lastSuccessAt);
    assert.equal(failed.failureCount, 1);
    assert.equal(+failed.nextSyncAt, clock + 60000);
    const before = calls;
    const restarted = createTournamentService(options);
    assert.equal((await restarted.sync(source.url)).skipped, true);
    assert.equal((await restarted.get(source.url, {})).syncError, true);
    assert.equal(calls, before);
    clock += 60000;
    await restarted.sync(source.url);
    assert.equal((await store.read(source.page)).failureCount, 2);
    assert.equal(+(await store.read(source.page)).nextSyncAt, clock + 120000);
    clock += 120000; broken = false;
    assert.equal((await restarted.sync(source.url)).saved, true);
    const recovered = await store.read(source.page);
    assert.equal(recovered.failureCount, 0);
    assert.equal(recovered.lastError, null);
    assert.equal(recovered.contentHash, first.contentHash, 'Unchanged content must not invalidate metadata just because it was checked');
  });

  await t.test('expired leases recover; an old worker cannot overwrite the new owner or mark it failed', async () => {
    const source2 = parseTournamentUrl('https://liquipedia.net/overwatch/Lease_Test');
    const first = await store.claim(source2, { now: clock, intervalMs: 300000, leaseMs: 1000 });
    assert.ok(first);
    assert.equal(await store.claim(source2, { now: clock, intervalMs: 300000, leaseMs: 1000 }), null);
    clock += 1001;
    const second = await store.claim(source2, { now: clock, intervalMs: 300000, leaseMs: 1000 });
    assert.ok(second);
    assert.notEqual(first.syncToken, second.syncToken);
    const payload = { version: 2, page: source2.page, observedAt: clock, blocks: [{ type: 'standings', rows: [] }] };
    assert.equal(await store.complete(source2.page, first.syncToken, payload, clock), false);
    assert.equal(await store.fail(source2.page, first.syncToken, { failureCount: 99, message: 'Late failure', nextSyncAt: clock }), false);
    assert.equal(await store.complete(source2.page, second.syncToken, payload, clock + 300000), true);
    assert.equal((await store.read(source2.page)).failureCount, 0);
  });

  await t.test('faster cadence takes effect after a season becomes active, while backoff remains respected', async () => {
    const source3 = parseTournamentUrl('https://liquipedia.net/overwatch/Cadence_Test');
    const claim = await store.claim(source3, { now: clock, intervalMs: 86400000, leaseMs: 1000 });
    const payload = { version: 2, page: source3.page, observedAt: clock, blocks: [{ type: 'standings', rows: [] }] };
    await store.complete(source3.page, claim.syncToken, payload, clock + 86400000);
    clock += 300001;
    assert.equal(await store.claim(source3, { now: clock, intervalMs: 86400000, leaseMs: 1000 }), null);
    assert.ok(await store.claim(source3, { now: clock, intervalMs: 300000, leaseMs: 1000 }));
  });

  await t.test('legacy file seeds an empty database row once, including when the source is unavailable', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'owcs-tournament-migration-'));
    t.after(async () => {
      assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(directory).startsWith('owcs-tournament-migration-'));
      await fs.rm(directory, { recursive: true, force: true });
    });
    const source4 = parseTournamentUrl('https://liquipedia.net/overwatch/Legacy_Test');
    const payload = { version: 2, page: source4.page, observedAt: clock, blocks: [{ type: 'standings', rows: [] }] };
    await fs.writeFile(path.join(directory, `${sourceKey(source4.page)}.json`), JSON.stringify(payload));
    const migrated = createTournamentService({ ...options, legacyCacheDir: directory, fetchPage: async () => { throw new Error('Offline'); } });
    await migrated.prepare(source4.url);
    assert.deepEqual(await migrated.readSaved(source4.page), payload);
    assert.match((await migrated.sync(source4.url)).error, /Offline/);
    assert.deepEqual(await migrated.readSaved(source4.page), payload);
    assert.equal(await store.seed(source4, { ...payload, observedAt: clock - 10000 }), false);
    assert.deepEqual(await createTournamentService(options).readSaved(source4.page), payload);
  });
});
