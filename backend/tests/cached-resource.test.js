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
