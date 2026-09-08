const test = require('node:test');
const assert = require('node:assert/strict');
const { extractMatchIdentities, sourceTimestamp } = require('../services/LiquipediaMatchIdentity');
const { findPollLinks, pairKey } = require('../services/MatchPollService');

const fixture = (date = 'September 12th, 2026 - 12:00 {{Abbr/PDT}}', first = 'Saudi Arabia') => `
<!-- {{Bracket|Bracket/2|id=ignored|R1M1={{Match}}}} -->
{{Bracket|Bracket/8|id=uIYUXBlvr4
|R1M1={{Match|bestof=5|date=${date}
|opponent1={{TeamOpponent|${first}|score=}}
|opponent2={{TeamOpponent|Spain}}
|map1={{Map|map=[[Ilios|IL]]|winner=|t1b1=}}}}
|R1M2={{Match|opponent1={{TeamOpponent|}}|opponent2={{TeamOpponent|}}}}
}}`;

test('extracts source bracket identity across nested templates, ignores TBD and commented templates', () => {
  const rows = extractMatchIdentities(fixture(), 135985);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceId, 'overwatch:uIYUXBlvr4_R01-M001');
  assert.deepEqual(rows[0].opponents, ['Saudi Arabia', 'Spain']);
  assert.equal(rows[0].timestamp, 1789239600000);
});
test('rescheduling keeps source identity, but changing opponents is detectable', () => {
  const original = extractMatchIdentities(fixture(), 1)[0];
  const moved = extractMatchIdentities(fixture('September 13th, 2026 - 12:00 {{Abbr/PDT}}'), 1)[0];
  assert.equal(original.sourceId, moved.sourceId);
  assert.notEqual(original.timestamp, moved.timestamp);
  const changed = extractMatchIdentities(fixture(undefined, 'France'), 1)[0];
  assert.equal(original.sourceId, changed.sourceId);
  assert.notDeepEqual(original.opponents, changed.opponents);
  assert.equal(sourceTimestamp('2026-10-19 - {{Abbr/JST}}'), null);
});
test('matchlist IDs use zero-padded source positions', () => {
  const rows = extractMatchIdentities('{{Matchlist|id=group|M2={{Match|opponent1={{TeamOpponent|C}}|opponent2={{TeamOpponent|D}}}}|M1={{Match|opponent1={{TeamOpponent|A}}|opponent2={{TeamOpponent|B}}}}}}', 1);
  assert.deepEqual(rows.map(r => r.sourceId), ['overwatch:group_0001', 'overwatch:group_0002']);
  assert.deepEqual(rows[0].opponents, ['A', 'B']);
});

const poll = { id: 1, seasonId: 25, pairKey: pairKey(64, 58), scheduledAt: '2026-09-12T19:00:00Z', matchId: null };
const match = { id: 9, seasonId: 25, team1Id: 58, team2Id: 64, matchDate: '2026-09-13' };
const now = Date.parse('2026-09-14T00:00:00Z');
test('links reversed teams in the right season and Shanghai date, never a future fixture', () => {
  assert.deepEqual(findPollLinks([poll], [match], now), [{ pollId: 1, matchId: 9 }]);
  assert.deepEqual(findPollLinks([poll], [match], 0), []);
  assert.deepEqual(findPollLinks([poll], [{ ...match, seasonId: 24 }], now), []);
  assert.deepEqual(findPollLinks([poll], [{ ...match, matchDate: '2026-09-11' }], now), []);
});
test('links dates within one calendar day of Shanghai date in either direction', () => {
  for (const matchDate of ['2026-09-12', '2026-09-14']) {
    assert.deepEqual(findPollLinks([poll], [{ ...match, matchDate }], now), [{ pollId: 1, matchId: 9 }]);
  }
  for (const matchDate of ['2026-09-11', '2026-09-15', '', 'invalid']) {
    assert.deepEqual(findPollLinks([poll], [{ ...match, matchDate }], now), []);
  }
  assert.deepEqual(findPollLinks([poll], [{ ...match, team2Id: 99 }], now), []);
});
test('adjacent-day rematches and competing polls remain ambiguous', () => {
  assert.deepEqual(findPollLinks([poll], [match, { ...match, id: 10, matchDate: '2026-09-12' }], now), []);
  assert.deepEqual(findPollLinks([poll, { ...poll, id: 2, scheduledAt: '2026-09-11T19:00:00Z' }], [match], now), []);
});
test('ambiguous rematches and competing polls never auto-link; established links are reserved', () => {
  assert.deepEqual(findPollLinks([poll], [match, { ...match, id: 10 }], now), []);
  assert.deepEqual(findPollLinks([poll, { ...poll, id: 2 }], [match], now), []);
  assert.deepEqual(findPollLinks([poll, { ...poll, id: 2, matchId: 9 }], [match], now), []);
});
test('the same source tournament can link to a different configured stage without splitting votes', () => {
  assert.deepEqual(findPollLinks([{ ...poll, seasonId: 24, scopeSeasonIds: [24, 25] }], [match], now), [{ pollId: 1, matchId: 9 }]);
  assert.deepEqual(findPollLinks([{ ...poll, seasonId: 24, scopeSeasonIds: [24] }], [match], now), []);
});
