const test = require('node:test');
const assert = require('node:assert/strict');

const { createCachedResource } = require('../services/CachedResource');

test('cached resource merges concurrent loads and returns stale data after a refresh error', async () => {
  let calls = 0;
  const resource = createCachedResource({
    ttlMs: 0,
    loader: async () => {
      calls += 1;
      if (calls === 1) return ['ok'];
      throw new Error('offline');
    }
  });

  const [first, joined] = await Promise.all([resource.get('event'), resource.get('event')]);
  assert.deepEqual(first.data, ['ok']);
  assert.deepEqual(joined.data, ['ok']);
  assert.equal(calls, 1);

  const stale = await resource.get('event');
  assert.equal(calls, 2);
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.data, ['ok']);
});

test('bounded waits retain the old observation and coalesce a slow refresh', async () => {
  let calls = 0, release;
  const resource = createCachedResource({ ttlMs: 0, maxWaitMs: 10, loader: async () => {
    calls++;
    if (calls === 1) return ['old'];
    return new Promise(resolve => { release = resolve; });
  } });
  const first = await resource.get('key');
  const [left, right] = await Promise.all([resource.get('key'), resource.get('key')]);
  assert.equal(calls, 2);
  assert.equal(left.stale, true);
  assert.equal(left.observedAt, first.observedAt);
  assert.deepEqual(right.data, ['old']);
  const pending = resource.get('key');
  release(['new']);
  assert.deepEqual((await pending).data, ['new']);
  assert.equal(calls, 2);
});

test('bounded wait without any successful cache rejects instead of returning empty facts', async () => {
  const resource = createCachedResource({ ttlMs: 100, maxWaitMs: 10, loader: () => new Promise(() => {}) });
  await assert.rejects(resource.get('key'), /timed out/);
});
