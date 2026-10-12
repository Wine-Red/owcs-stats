const test = require('node:test');
const assert = require('node:assert/strict');
const { createExternalMatchSyncClient, validateSummary, validateDetail } = require('../services/ExternalMatchSyncClient');
const { HERO_NAME_ALIASES, heroNameKey, parseDuration, parseKad, mapWithConcurrency, numberOrNull, normalizeRole, validateMatchPlayerRoles } = require('../services/IncrementalMatchSyncService');

test('fetchChanges preserves the opaque cursor and accepts schema v3', async () => {
  let requestedUrl = '';
  const client = createExternalMatchSyncClient({
    baseUrl: 'https://example.test/',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          schemaVersion: 3,
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

test('fetchChanges reports a readable error when authentication returns HTML', async () => {
  const client = createExternalMatchSyncClient({
    baseUrl: 'https://match.example.test',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: 'https://auth.example.test/login',
      headers: { get: () => 'text/html; charset=utf-8' },
      json: async () => { throw new SyntaxError("Unexpected token '<'"); }
    })
  });
  await assert.rejects(
    () => client.fetchChanges({ limit: 1 }),
    /invalid JSON \(text\/html; charset=utf-8\).*redirect to https:\/\/auth\.example\.test\/login/
  );
});

test('validators reject malformed pages and accept v2/v3 matching details', () => {
  assert.throws(
    () => validateSummary({ schemaVersion: 2, items: [{ operation: 'unknown', id: '1' }], hasMore: false }),
    /invalid item/
  );
  assert.throws(
    () => validateSummary({ schemaVersion: 2, items: [], hasMore: true }),
    /nextCursor/
  );
  assert.deepEqual(validateDetail({ schemaVersion: 2, match: { id: '1' } }, '1'), { id: '1' });
  assert.deepEqual(validateDetail({ schemaVersion: 3, match: { id: '1' } }, '1'), { id: '1' });
});

test('sync helpers parse API values and preserve concurrent result order', async () => {
  assert.equal(parseDuration('12:30'), 12.5);
  assert.deepEqual(parseKad('7/8/9'), { kills: 7, assists: 8, deaths: 9 });
  const result = await mapWithConcurrency([3, 1, 2], 2, async value => value * 2);
  assert.deepEqual(result, [6, 2, 4]);
});

test('hero aliases normalize dotted MEKA hero names', () => {
  assert.equal(HERO_NAME_ALIASES.dmon, 'd.mon');
  assert.equal(heroNameKey('DMON'), heroNameKey('D.Mon'));
  assert.equal(HERO_NAME_ALIASES.dva, 'd.va');
  assert.equal(heroNameKey('DVA'), heroNameKey('D.Va'));
});

test('sync preserves missing charge samples as null and distinguishes measured zero', () => {
  for (const missing of [null, undefined, '', ' ', 'invalid', NaN, Infinity]) {
    assert.equal(numberOrNull(missing), null);
  }
  assert.equal(numberOrNull(0), 0);
  assert.equal(numberOrNull('0'), 0);
  assert.equal(numberOrNull(92.7), 92.7);
  assert.equal(numberOrNull('92.7'), 92.7);
});

test('player roles accept canonical values and case/whitespace variations only', () => {
  for (const [expected, values] of Object.entries({
    tank: ['T', 't', ' tank ', 'TANK'],
    damage: ['D', 'd', 'damage', ' Damage '],
    support: ['S', 's', 'support', ' SUPPORT ']
  })) {
    for (const value of values) assert.equal(normalizeRole(value), expected);
  }
  for (const value of ['F', 'flex', '', ' ', null, undefined, 1, 'constructor', '__proto__']) {
    assert.equal(normalizeRole(value), null);
  }
});

test('invalid source roles identify the match, later map and player without guessing a historical role', () => {
  const match = { id: '1675', rounds: [
    { mapName: '第一张图', playersA: [{ name: 'SOAE', role: 'D' }] },
    { mapName: '香巴里寺院', playersA: [{ name: 'SOAE', role: 'F' }] }
  ] };
  const before = structuredClone(match);
  assert.throws(() => validateMatchPlayerRoles(match), /比赛 1675 第 2 张图（香巴里寺院）选手 SOAE 的位置 "F" 无效/);
  assert.deepEqual(match, before);
  match.rounds[1].playersA[0].role = 'S';
  assert.doesNotThrow(() => validateMatchPlayerRoles(match));
  match.rounds[1].playersB = [{ name: 'Other', role: null }];
  assert.throws(() => validateMatchPlayerRoles(match), /选手 Other 的位置 null 无效/);
});
