const test = require('node:test');
const assert = require('node:assert/strict');
const {
  aggregateTimeline,
  buildTimelineMirrorAttributes,
  clearTimelineDerivedPlayerData
} = require('../services/TimelineHeroAggregationService');

test('timeline mirror keeps the canonical MatchWeb payload losslessly', () => {
  const payload = { schemaVersion: 1, source: { taskId: 'task-1' }, events: [{ eventId: 'e1' }] };
  const syncedAt = new Date('2026-09-01T00:00:00.000Z');
  const row = buildTimelineMirrorAttributes({
    timeline: payload,
    timelineMeta: {
      revision: 3,
      digest: 'a'.repeat(64),
      sourceTaskId: 'task-1',
      updatedAt: '2026-08-31T23:59:59.000Z'
    }
  }, syncedAt);
  assert.strictEqual(row.payload, payload);
  assert.deepEqual(row, {
    schemaVersion: 1,
    revision: 3,
    digest: 'a'.repeat(64),
    sourceTaskId: 'task-1',
    payload,
    sourceUpdatedAt: '2026-08-31T23:59:59.000Z',
    syncedAt
  });
});

test('timeline aggregation derives only hero detail and preserves source player statistics', () => {
  const timeline = {
    schemaVersion: 1,
    media: { durationMs: 100_000 },
    players: [
      { playerId: 'PINEAPPLE', displayName: 'PINEAPPLE', teamSide: 'A', role: 'tank', slot: 0 },
      { playerId: 'LIGE', displayName: 'LIGE', teamSide: 'B', role: 'tank', slot: 5 }
    ],
    rounds: [{ roundId: 'round-1', startMs: 0, endMs: 100_000 }],
    events: [
      { eventId: 'e1', timeMs: 0, type: 'hero_selected', status: 'confirmed', roundId: 'round-1', playerId: 'PINEAPPLE', heroId: 'winston', heroName: '温斯顿' },
      { eventId: 'e2', timeMs: 0, type: 'hero_selected', status: 'confirmed', roundId: 'round-1', playerId: 'LIGE', heroId: 'dva', heroName: 'D.Va' },
      { eventId: 'e3', timeMs: 20_000, type: 'kill', status: 'confirmed', roundId: 'round-1', killerId: 'PINEAPPLE', victimId: 'LIGE' },
      { eventId: 'e4', timeMs: 40_000, type: 'ultimate_ready', status: 'confirmed', roundId: 'round-1', playerId: 'PINEAPPLE', heroId: 'winston', heroName: '温斯顿' },
      { eventId: 'e5', timeMs: 45_000, type: 'ultimate_used', status: 'confirmed', roundId: 'round-1', playerId: 'PINEAPPLE', heroId: 'winston', heroName: '温斯顿' },
      { eventId: 'e6', timeMs: 60_000, type: 'hero_switch', status: 'confirmed', roundId: 'round-1', playerId: 'PINEAPPLE', heroId: 'dva', heroName: 'D.Va' }
    ]
  };
  const result = aggregateTimeline(timeline, {
    playersA: [{ playerId: 'PINEAPPLE', name: 'Pineapple source', role: 'T', kad: '9/2/8', damage: 1234, finalBlows: 7 }],
    playersB: [{ playerId: 'LIGE', name: 'Lige old', role: 'T', kad: '2/3/9' }]
  });
  const pineapple = result.playersA[0];
  assert.equal(pineapple.playerId, 'PINEAPPLE');
  assert.equal(pineapple.name, 'Pineapple source');
  assert.equal(pineapple.kad, '9/2/8');
  assert.equal(pineapple.damage, 1234);
  assert.equal(pineapple.finalBlows, 1);
  assert.deepEqual(pineapple.heroes.map(hero => [hero.heroId, hero.usageSeconds, hero.usagePercentage]), [
    ['winston', 60, 60],
    ['dva', 40, 40]
  ]);
  assert.equal(pineapple.heroes[0].ultReady, 1);
  assert.equal(pineapple.heroes[0].ultUsed, 1);
  assert.equal(pineapple.heroes[0].avgUltChargeSeconds, 40);
  assert.equal(pineapple.heroes[0].finalBlows, 1);
  assert.equal(result.playersB[0].heroes[0].deathsByFinalBlow, 1);
});

test('timeline aggregation keeps legacy rows when a roster slot is absent', () => {
  const result = aggregateTimeline({
    media: { durationMs: 10_000 },
    players: [],
    events: []
  }, {
    playersA: [{ playerId: 'KNOWN', name: 'KNOWN', role: 'D', kad: '1/2/3', heroes: [{ hero: '旧值' }] }],
    playersB: []
  });
  assert.equal(result.playersA[0].playerId, 'KNOWN');
  assert.equal(result.playersA[0].kad, '1/2/3');
  assert.deepEqual(result.playersA[0].heroes, []);
});

test('round-local aggregation resets hero state when every round restarts at zero', () => {
  const result = aggregateTimeline({
    schemaVersion: 2,
    timebase: { kind: 'round-local' },
    media: { durationMs: 80_000 },
    players: [{ playerId: 'TANK', displayName: 'TANK', teamSide: 'A', role: 'tank', slot: 0 }],
    rounds: [
      { roundId: 'round-1', index: 1, startMs: 0, endMs: 40_000, durationMs: 40_000 },
      { roundId: 'round-2', index: 2, startMs: 0, endMs: 40_000, durationMs: 40_000 }
    ],
    // Deliberately interleaved by local timestamp: ordering must still follow round index.
    events: [
      { eventId: 'r2-select', timeMs: 0, type: 'hero_selected', status: 'confirmed', roundId: 'round-2', playerId: 'TANK', heroId: 'dva', heroName: 'D.Va' },
      { eventId: 'r1-select', timeMs: 0, type: 'hero_selected', status: 'confirmed', roundId: 'round-1', playerId: 'TANK', heroId: 'winston', heroName: '温斯顿' },
      { eventId: 'r2-kill', timeMs: 3_000, type: 'kill', status: 'confirmed', roundId: 'round-2', killerId: 'TANK', victimId: 'OTHER' },
      { eventId: 'r1-kill', timeMs: 4_000, type: 'kill', status: 'confirmed', roundId: 'round-1', killerId: 'TANK', victimId: 'OTHER' }
    ]
  }, {
    playersA: [{ playerId: 'TANK', name: 'TANK', kad: '8/2/3' }],
    playersB: []
  });
  const tank = result.playersA[0];
  assert.equal(tank.kad, '8/2/3');
  assert.deepEqual(tank.heroes.map(hero => [hero.heroId, hero.usageSeconds, hero.finalBlows]), [
    ['dva', 40, 1],
    ['winston', 40, 1]
  ]);
  assert.equal(tank.finalBlows, 2);
});

test('hero aggregation keeps only usage strictly over 30 seconds without reducing player final blows', () => {
  const result = aggregateTimeline({
    schemaVersion: 1,
    media: { durationMs: 61_000 },
    players: [{ playerId: 'DPS', displayName: 'DPS', teamSide: 'A', role: 'damage', slot: 0 }],
    rounds: [{ roundId: 'round-1', startMs: 0, endMs: 61_000 }],
    events: [
      { eventId: 'select-tracer', timeMs: 0, type: 'hero_selected', status: 'confirmed', roundId: 'round-1', playerId: 'DPS', heroId: 'tracer', heroName: '猎空' },
      { eventId: 'tracer-kill', timeMs: 10_000, type: 'kill', status: 'confirmed', roundId: 'round-1', killerId: 'DPS', victimId: 'OTHER' },
      { eventId: 'switch-ana', timeMs: 30_000, type: 'hero_switch', status: 'confirmed', roundId: 'round-1', playerId: 'DPS', heroId: 'ana', heroName: '安娜' },
      { eventId: 'ana-kill', timeMs: 50_000, type: 'kill', status: 'confirmed', roundId: 'round-1', killerId: 'DPS', victimId: 'OTHER' }
    ]
  }, {
    playersA: [{ playerId: 'DPS', name: 'DPS', kad: '2/0/0' }],
    playersB: []
  });

  assert.equal(result.playersA[0].finalBlows, 2);
  assert.deepEqual(result.playersA[0].heroes.map(hero => [hero.heroId, hero.usageSeconds, hero.finalBlows]), [
    ['ana', 31, 1]
  ]);
});

test('deleting a timeline clears hero and final-blow aggregates only', () => {
  const cleared = clearTimelineDerivedPlayerData({
    playersA: [{ playerId: 'A', kad: '9/2/8', damage: 1234, finalBlows: 6, heroes: [{ hero: '温斯顿' }] }],
    playersB: [{ playerId: 'B', kad: '4/3/1', healing: 4321, finalBlows: 2, heroes: [{ hero: '安娜' }] }]
  });
  assert.deepEqual(cleared, {
    playersA: [{ playerId: 'A', kad: '9/2/8', damage: 1234, finalBlows: 0, heroes: [] }],
    playersB: [{ playerId: 'B', kad: '4/3/1', healing: 4321, finalBlows: 0, heroes: [] }]
  });
});

const deathFixture = events => ({
  schemaVersion: 2,
  timebase: { kind: 'round-local' },
  media: { durationMs: 400_000 },
  players: [
    { playerId: 'VICTIM', teamSide: 'A' },
    { playerId: 'KILLER', teamSide: 'B' }
  ],
  rounds: [1, 2].map(index => ({ roundId: `round-${index}`, index, startMs: 0, endMs: 200_000 })),
  events: [
    ...[1, 2].flatMap(index => [
      { type: 'hero_selected', playerId: 'VICTIM', heroId: 'cassidy', timeMs: 0, roundId: `round-${index}` },
      { type: 'hero_selected', playerId: 'KILLER', heroId: 'tracer', timeMs: 0, roundId: `round-${index}` }
    ]),
    ...events.map(event => ({ status: 'confirmed', roundId: 'round-1', ...event }))
  ]
});
const death = (timeMs, extra = {}) => ({ type: 'death', playerId: 'VICTIM', timeMs, ...extra });
const kill = (timeMs, extra = {}) => ({ type: 'kill', killerId: 'KILLER', victimId: 'VICTIM', timeMs, ...extra });
const victimDeaths = result => result.playersA[0].heroes.reduce((sum, hero) => sum + hero.deathsByFinalBlow, 0);

test('linked kill and death crossing the old time bucket count once in either timestamp order', () => {
  for (const [deathTime, killTime] of [[137_000, 137_500], [137_500, 137_000]]) {
    const timeline = deathFixture([
      death(deathTime, { evidenceIds: ['death-proof'] }),
      kill(killTime, { evidenceIds: ['killfeed-proof', 'death-proof'] })
    ]);
    const before = structuredClone(timeline);
    const result = aggregateTimeline(timeline);
    assert.equal(victimDeaths(result), 1);
    assert.equal(result.playersB[0].finalBlows, 1);
    assert.deepEqual(timeline, before, 'aggregation must not rewrite canonical timestamps or evidence');
  }
});

test('death attribution uses its own hero even when the linked kill arrives after a switch', () => {
  const result = aggregateTimeline(deathFixture([
    death(80_000, { evidenceIds: ['death-proof'] }),
    { type: 'hero_switch', playerId: 'VICTIM', heroId: 'ana', timeMs: 81_000 },
    kill(84_000, { heroId: 'tracer', evidenceIds: ['death-proof'] })
  ]));
  assert.equal(victimDeaths(result), 1);
  assert.equal(result.playersA[0].heroes.find(hero => hero.heroId === 'cassidy').deathsByFinalBlow, 1);
  assert.equal(result.playersA[0].heroes.find(hero => hero.heroId === 'ana').deathsByFinalBlow, 0);
  assert.equal(result.playersB[0].heroes[0].finalBlows, 1);
});

test('legacy kill/death pairs use actual distance and keep unpaired deaths and kills', () => {
  const result = aggregateTimeline(deathFixture([
    death(137_000), kill(137_500),
    death(150_000),
    kill(170_000),
    death(190_000), kill(191_501)
  ]));
  assert.equal(victimDeaths(result), 5);
  assert.equal(result.playersB[0].finalBlows, 3);
});

test('nearby independent deaths survive and evidence matches take priority over temporal fallback', () => {
  const result = aggregateTimeline(deathFixture([
    death(100_000, { evidenceIds: ['first-death'] }),
    death(100_500, { evidenceIds: ['second-death'] }),
    kill(100_600),
    kill(104_000, { evidenceIds: ['first-death'] })
  ]));
  assert.equal(victimDeaths(result), 2);
  assert.equal(result.playersB[0].finalBlows, 2);
});

test('legacy temporal pairing is one-to-one even for multiple close deaths', () => {
  const result = aggregateTimeline(deathFixture([
    death(100_000), death(101_400), kill(101_100), kill(102_000),
    kill(120_000), kill(120_500)
  ]));
  assert.equal(victimDeaths(result), 4);
  assert.equal(result.playersB[0].finalBlows, 4);
});

test('death matching never crosses round-local rounds or includes rejected events', () => {
  const result = aggregateTimeline(deathFixture([
    death(137_000, { evidenceIds: ['same-proof'] }),
    kill(137_500, { roundId: 'round-2', evidenceIds: ['same-proof'] }),
    death(137_000, { roundId: 'round-2', status: 'rejected' }),
    kill(150_000, { status: 'rejected' })
  ]));
  assert.equal(victimDeaths(result), 2);
  assert.equal(result.playersB[0].finalBlows, 1);
});
