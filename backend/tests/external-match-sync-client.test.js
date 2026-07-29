const test = require('node:test');
const assert = require('node:assert/strict');
const { createExternalMatchSyncClient, validateSummary, validateDetail } = require('../services/ExternalMatchSyncClient');
const { HERO_NAME_ALIASES, heroNameKey, parseDuration, parseKad, mapWithConcurrency } = require('../services/IncrementalMatchSyncService');

test('fetchChanges preserves the opaque cursor and validates schema v2', async () => {
  let requestedUrl = '';
  const client = createExternalMatchSyncClient({
    baseUrl: 'https://example.test/',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          schemaVersion: 2,
          items: [{ operation: 'delete', id: 'match/1' }],
          nextCursor: 'next-cursor',
          hasMore: false
        })
      };
    }
  });
  const result = await client.fetchChanges({ cursor: 'opaque+/=', limit: 25 });
  assert.equal(requestedUrl, 'https://example.test/api/sync/matches?limit=25&cursor=opaque%2B%2F%3D');
  assert.equal(result.nextCursor, 'next-cursor');
});

test('fetchMatch URL-encodes IDs and rejects mismatched details', async () => {
  let requestedUrl = '';
  const client = createExternalMatchSyncClient({
    baseUrl: 'https://example.test',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ schemaVersion: 2, match: { id: 'wrong-id' } }) };
    }
  });
  await assert.rejects(() => client.fetchMatch('match/1'), /ID mismatch/);
  assert.equal(requestedUrl, 'https://example.test/api/sync/matches/match%2F1');
});

test('validators reject malformed pages and accept a matching detail', () => {
  assert.throws(
    () => validateSummary({ schemaVersion: 2, items: [{ operation: 'unknown', id: '1' }], hasMore: false }),
    /invalid item/
  );
  assert.throws(
    () => validateSummary({ schemaVersion: 2, items: [], hasMore: true }),
    /nextCursor/
  );
  assert.deepEqual(validateDetail({ schemaVersion: 2, match: { id: '1' } }, '1'), { id: '1' });
});

test('sync helpers parse API values and preserve concurrent result order', async () => {
  assert.equal(parseDuration('12:30'), 12.5);
  assert.deepEqual(parseKad('7/8/9'), { kills: 7, assists: 8, deaths: 9 });
  const result = await mapWithConcurrency([3, 1, 2], 2, async value => value * 2);
  assert.deepEqual(result, [6, 2, 4]);
});

test('hero aliases map external DVA to the database D.Va key', () => {
  assert.equal(HERO_NAME_ALIASES.dva, 'd.va');
  assert.equal(heroNameKey('DVA'), heroNameKey('D.Va'));
});
