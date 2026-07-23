const test = require('node:test');
const assert = require('node:assert/strict');
const { validateQueryPlan, QUERY_PLAN_TOOL } = require('../services/agent/QueryPlan');
const { ALL_METRIC_NAMES } = require('../services/agent/MetricRegistry');

const rawPlan = overrides => ({
  intent: 'query',
  subject: 'player',
  metric: 'damage_per_10',
  seasonId: 13,
  seasonName: '',
  stageId: 0,
  stageName: '',
  filters: {
    playerNames: [], teamNames: [], heroNames: [], mapNames: [],
    roles: ['damage'], mapTypes: [], dateFrom: '', dateTo: ''
  },
  minimumMaps: 3,
  minimumMinutes: 60,
  sortDirection: 'desc',
  limit: 10,
  questionSummary: '输出位伤害排行',
  clarificationReason: '',
  ...overrides
});

test('validates and bounds a supported query plan', () => {
  const plan = validateQueryPlan(rawPlan({ limit: 99, minimumMaps: -4 }));
  assert.equal(plan.metric, 'damage_per_10');
  assert.equal(plan.limit, 20);
  assert.equal(plan.minimumMaps, 0);
  assert.deepEqual(plan.filters.roles, ['damage']);
});

test('rejects a metric outside the semantic registry', () => {
  assert.throws(() => validateQueryPlan(rawPlan({ metric: 'drop_database' })), /不支持指标/);
});

test('exposes only registered metrics in the strict model schema', () => {
  const metricEnum = QUERY_PLAN_TOOL.function.parameters.properties.metric.enum;
  assert.deepEqual(metricEnum, ['', ...ALL_METRIC_NAMES]);
  assert.equal(metricEnum.includes('drop_database'), false);
});

test('normalizes clarification plans without requiring a metric', () => {
  const plan = validateQueryPlan(rawPlan({ intent: 'clarify', metric: '', clarificationReason: '请选择赛季' }));
  assert.equal(plan.intent, 'clarify');
  assert.equal(plan.metric, '');
  assert.equal(plan.clarificationReason, '请选择赛季');
});
