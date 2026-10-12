import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMatchFleta } from './matchFleta.mjs';

test('match index uses weighted totals and counts each appearance only once', () => {
  const maps = [{ id: 1, timeline: {} }, { id: 2, timeline: {} }];
  const rows = [{ playerId: 7, mapGameId: 1, fletaFinalBlows: 2, fletaTeamFinalBlows: 3 },
    { playerId: 7, mapGameId: 2, fletaFinalBlows: 1, fletaTeamFinalBlows: 7 }];
  assert.equal(aggregateMatchFleta(maps, [...rows, rows[0]]).get('7'), 60);
});

test('uncovered appearances are unknown, substitutes use their own maps, and measured zero remains zero', () => {
  const maps = [{ id: 1, timeline: {} }, { id: 2, timeline: null }];
  const rows = [{ playerId: 7, mapGameId: 1, fletaFinalBlows: 0, fletaTeamFinalBlows: 10 },
    { playerId: 8, mapGameId: 1, fletaFinalBlows: 6, fletaTeamFinalBlows: 10 },
    { playerId: 8, mapGameId: 2 }];
  const result = aggregateMatchFleta(maps, rows);
  assert.equal(result.get('7'), 0);
  assert.equal(result.get('8'), null);
});
