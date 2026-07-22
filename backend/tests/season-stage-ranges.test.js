const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStageRanges } = require('../services/SeasonStageService');

test('stage boundaries close the previous stage and keep the last stage open', () => {
  const matches = [
    { id: 3, matchDate: '2026-03-03' },
    { id: 1, matchDate: '2026-03-01' },
    { id: 4, matchDate: '2026-03-04' },
    { id: 2, matchDate: '2026-03-02' }
  ];
  const stages = [
    { id: 10, name: '第一阶段', startMatchId: null },
    { id: 11, name: '第二阶段', startMatchId: 3 }
  ];

  const ranges = buildStageRanges(matches, stages);
  assert.deepEqual(ranges[0].matchIds, [1, 2]);
  assert.deepEqual(ranges[1].matchIds, [3, 4]);
  assert.equal(ranges[0].isCurrent, false);
  assert.equal(ranges[1].isCurrent, true);
});

test('new matches are automatically included in the current stage', () => {
  const stages = [
    { id: 10, name: '第一阶段', startMatchId: null },
    { id: 11, name: '第二阶段', startMatchId: 2 }
  ];
  const initial = buildStageRanges([
    { id: 1, matchDate: '2026-03-01' },
    { id: 2, matchDate: '2026-03-02' }
  ], stages);
  const afterSync = buildStageRanges([
    { id: 1, matchDate: '2026-03-01' },
    { id: 2, matchDate: '2026-03-02' },
    { id: 3, matchDate: '2026-03-03' }
  ], stages);

  assert.deepEqual(initial[1].matchIds, [2]);
  assert.deepEqual(afterSync[1].matchIds, [2, 3]);
});
