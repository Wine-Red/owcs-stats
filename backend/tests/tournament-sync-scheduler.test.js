const test = require('node:test');
const assert = require('node:assert/strict');
const { createTournamentScheduler, planTournamentSync, syncInterval } = require('../services/TournamentSyncScheduler');

const now = Date.parse('2026-09-28T04:00:00Z'), hour = 3600000;
const url = 'https://liquipedia.net/overwatch/Test';
const config = (id, extra = {}) => ({ key: `visualize_season_${id}`, value: { liquipediaTournamentUrl: url, ...extra } });

test('cadence follows actual dates, with safe status fallback; shared pages sync once at the fastest cadence', () => {
  assert.equal(syncInterval({ status: 'completed' }, { dateRange: '2026.09.20 - 2026.10.01' }, now), 5 * 60000);
  assert.equal(syncInterval({}, { dateRange: '2026.10.01 - 2026.10.05' }, now), hour);
  assert.equal(syncInterval({}, { dateRange: '2026.09.01 - 2026.09.27' }, now), hour);
  assert.equal(syncInterval({}, { dateRange: '2026.08.01 - 2026.08.27' }, now), 24 * hour);
  assert.equal(syncInterval({ status: 'completed' }, {}, now), 24 * hour);
  assert.equal(syncInterval({ status: 'in_progress' }, {}, now), 5 * 60000);
  const plan = planTournamentSync([{ id: 1, status: 'completed' }, { id: 2, status: 'in_progress' },
    { id: 3, name: 'unknown' }, { id: 4 }], [config(1), config(2), config(4, { liquipediaTournamentUrl: 'https://example.com/Test' })], now);
  assert.equal(plan.sources.length, 1);
  assert.deepEqual(plan.sources[0].seasonIds, [1, 2]);
  assert.equal(plan.sources[0].intervalMs, 5 * 60000);
  assert.equal(plan.errors[0].seasonId, 4);
});

test('worker starts without public requests, coalesces runs, discovers changed links, and stops cleanly', async () => {
  const calls = [], prepared = [];
  let rows = [config(1)], release, reads = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const scheduler = createTournamentScheduler({ now: () => now, tickMs: hour, logger: { info() {}, error() {} },
    readCatalog: async () => { reads++; return { seasons: [{ id: 1 }], configs: rows }; },
    service: { prepare: async source => prepared.push(source), sync: async source => { calls.push(source); if (calls.length === 1) await gate; return { saved: true }; } }
  });
  scheduler.start();
  try {
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(calls.length, 1);
    const first = scheduler.runOnce(), second = scheduler.runOnce();
    assert.equal(first, second);
    rows = [config(1, { liquipediaTournamentUrl: `${url}_New` })];
    scheduler.wake();
    release();
    await first;
    for (let i = 0; i < 30 && calls.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(calls, [url, `${url}_New`]);
    assert.deepEqual(prepared, calls);
    await scheduler.stop();
    const stopped = reads;
    scheduler.wake();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(reads, stopped);
  } finally { release(); await scheduler.stop(); }
});

test('one broken source does not prevent other seasons from syncing', async () => {
  const calls = [];
  const scheduler = createTournamentScheduler({ logger: { info() {}, error() {} },
    readCatalog: async () => ({ seasons: [{ id: 1 }, { id: 2 }], configs: [config(1), config(2, { liquipediaTournamentUrl: `${url}_2` })] }),
    service: { sync: async source => { calls.push(source); if (source === url) throw new Error('DB unavailable'); return { saved: true }; } }
  });
  const report = await scheduler.runOnce();
  assert.equal(calls.length, 2);
  assert.equal(report.saved, 1);
  assert.equal(report.errors.length, 1);
});
