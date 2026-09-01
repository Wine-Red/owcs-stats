const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMatchDataDetail, timelineSummary } = require('../services/MatchDataDetailService');

test('timeline summary exposes coverage without returning the raw payload', () => {
  const summary = timelineSummary({
    schemaVersion: 2,
    revision: 2,
    digest: 'a'.repeat(64),
    sourceTaskId: 'task-1',
    payload: {
      source: { system: 'owcs-studio' },
      timebase: { kind: 'round-local' },
      players: [{}, {}],
      segments: [{}],
      rounds: [{ roundId: 'round-1', index: 1, durationMs: 12_000 }],
      phases: [{}, {}],
      events: [{ type: 'kill' }, { type: 'kill' }, { type: 'ultimate_used' }],
      evidence: [{}, {}, {}]
    }
  });
  assert.deepEqual(summary.counts, {
    players: 2, segments: 1, rounds: 1, phases: 2, events: 3, evidence: 3
  });
  assert.deepEqual(summary.eventTypes, { kill: 2, ultimate_used: 1 });
  assert.deepEqual(summary.timebase, { kind: 'round-local' });
  assert.equal(summary.effectiveDurationMs, 12_000);
  assert.deepEqual(summary.rounds, [{ roundId: 'round-1', index: 1, durationMs: 12_000, eventCount: 0 }]);
  assert.equal(Object.hasOwn(summary, 'payload'), false);
});

test('match detail groups player and hero rows by map in round order', () => {
  const payload = buildMatchDataDetail({
    match: { id: 7, matchDate: '2026-09-01' },
    mapGames: [
      { id: 11, duration: 60, externalRoundIndex: 0, timeline: { schemaVersion: 1, revision: 1, payload: { events: [] } } },
      { id: 12, duration: 90, externalRoundIndex: 1, timeline: null }
    ],
    playerStats: [
      { id: 101, mapGameId: 11, heroStats: [{ heroName: '温斯顿' }] },
      { id: 102, mapGameId: 12, heroStats: [{ heroName: '安娜' }, { heroName: '禅雅塔' }] }
    ]
  });
  assert.equal(payload.summary.totalDurationSeconds, 150);
  assert.equal(payload.summary.timelineMaps, 1);
  assert.equal(payload.summary.heroStats, 3);
  assert.equal(payload.mapGames[0].playerStats[0].id, 101);
  assert.equal(payload.mapGames[1].playerStats[0].id, 102);
});
