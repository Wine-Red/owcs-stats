const test = require('node:test');
const assert = require('node:assert/strict');
const { createUpcomingResources } = require('../services/UpcomingMatchesService');

test('display and voting share one ticker read while only voting enriches identity', async () => {
  let reads = 0, identities = 0;
  const api = createUpcomingResources({ loadSchedule: async () => { reads++; return [{ name: 'A vs B' }]; },
    attachIdentities: async rows => { identities++; return rows.map(row => ({ ...row, sourceId: 'verified' })); } });
  const [display, voting, again] = await Promise.all([api.getUpcomingSchedule(), api.getUpcomingMatches(), api.getUpcomingSchedule()]);
  assert.equal(reads, 1); assert.equal(identities, 1);
  assert.deepEqual(display.data, [{ name: 'A vs B' }]); assert.deepEqual(display, again);
  assert.equal(voting.data[0].sourceId, 'verified');
  await api.getUpcomingMatches(); await api.getUpcomingSchedule();
  assert.equal(reads, 1); assert.equal(identities, 1);
});

test('a failed shared refresh preserves the last display and closes stale voting', async t => {
  let now = 1000, reads = 0, identities = 0;
  t.mock.method(Date, 'now', () => now);
  const api = createUpcomingResources({ ttlMs: 100, loadSchedule: async () => {
    reads++; if (reads > 1) throw new Error('Upstream offline'); return [{ match: 1 }];
  }, attachIdentities: async rows => { identities++; return rows.map(row => ({ ...row, sourceId: 'verified' })); } });
  await api.getUpcomingMatches(); now += 101;
  const [display, voting] = await Promise.all([api.getUpcomingSchedule(), api.getUpcomingMatches()]);
  assert.equal(reads, 2); assert.equal(identities, 1);
  assert.equal(display.stale, true); assert.equal(voting.stale, true);
  assert.equal(display.observedAt, 1000); assert.equal(voting.observedAt, 1000);
  assert.equal(voting.data[0].sourceId, 'verified');
});

test('bounded refresh returns stale data then recovers from the same queued source request', async t => {
  let now = 1000, reads = 0, complete;
  t.mock.method(Date, 'now', () => now);
  const api = createUpcomingResources({ ttlMs: 100, maxWaitMs: 5, loadSchedule: async () => {
    if (++reads === 1) return [{ match: 1 }];
    return new Promise(resolve => { complete = resolve; });
  } });
  await api.getUpcomingSchedule(); now += 101;
  const delayed = await api.getUpcomingSchedule();
  assert.equal(delayed.stale, true); assert.deepEqual(delayed.data, [{ match: 1 }]);
  complete([{ match: 2 }]); await new Promise(resolve => setImmediate(resolve));
  const fresh = await api.getUpcomingSchedule();
  assert.equal(fresh.stale, false); assert.deepEqual(fresh.data, [{ match: 2 }]); assert.equal(reads, 2);
});

test('late identity enrichment does not extend ticker freshness or preserve removed fixtures', async t => {
  let now = 1000, reads = 0;
  t.mock.method(Date, 'now', () => now);
  const api = createUpcomingResources({ ttlMs: 100, loadSchedule: async () => [{ match: ++reads }],
    attachIdentities: async rows => rows.map(row => ({ ...row, sourceId: `fixture-${row.match}` })) });
  await api.getUpcomingSchedule(); now = 1090;
  const first = await api.getUpcomingMatches();
  assert.equal(first.observedAt, 1000); assert.equal(first.data[0].sourceId, 'fixture-1');
  now = 1101;
  const fresh = await api.getUpcomingMatches();
  assert.equal(reads, 2); assert.equal(fresh.observedAt, 1101);
  assert.equal(fresh.data[0].sourceId, 'fixture-2');
});
