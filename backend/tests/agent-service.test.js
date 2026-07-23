const test = require('node:test');
const assert = require('node:assert/strict');
const AgentService = require('../services/agent/AgentService');
const { plainTextAnswer, groundPlan, clarificationEvidence } = AgentService._private;

const plan = {
  intent: 'query', subject: 'team', metric: 'match_win_rate', seasonId: 13, seasonName: '',
  stageId: 0, stageName: '',
  filters: { playerNames: [], teamNames: [], heroNames: [], mapNames: [], roles: [], mapTypes: [], dateFrom: '', dateTo: '' },
  minimumMaps: 0, minimumMinutes: 0, sortDirection: 'desc', limit: 3,
  questionSummary: '战队胜率排行', clarificationReason: ''
};

test('always performs planning and final answer composition as two model calls', async () => {
  const calls = [];
  const client = {
    callTool: async ({ tool }) => {
      calls.push(tool.function.name);
      if (tool.function.name === 'build_query_plan') return { value: plan, usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } };
      return {
        value: { answer: 'A队以75%的比赛胜率排名第一。', confidence: 'high', followUps: ['查看地图胜率'] },
        usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 }
      };
    }
  };
  const executor = {
    execute: async () => ({
      rows: [{ teamName: 'A队', value: 75 }], metric: 'match_win_rate', metricLabel: '比赛胜率',
      scope: { seasonId: 13, seasonName: '赛季A', matchCount: 4, mapCount: 15 },
      coverage: { basicStats: { status: 'available', ratio: 1 } }, warnings: [], insufficient: false
    })
  };
  const service = new AgentService({
    client, executor,
    Season: { findAll: async () => [{ id: 13, name: '赛季A', status: 'in_progress' }] },
    SeasonStage: { findAll: async () => [] },
    cacheTtlMs: 1000
  });
  const result = await service.ask({ messages: [{ role: 'user', content: '赛季A谁的胜率最高？' }], context: {} });
  assert.deepEqual(calls, ['build_query_plan', 'deliver_answer']);
  assert.match(result.answer, /75%/);
  assert.equal(result.scope.seasonId, 13);
  assert.equal(result.usage.totalTokens, 230);
});

test('removes presentation markdown from model-composed chat text', () => {
  assert.equal(plainTextAnswer('## 排行\n1. **Alpha**：`75%`'), '排行\n1. Alpha：75%');
});

test('removes unsupported substitute suggestions from clarification evidence', () => {
  const evidence = clarificationEvidence('当前不支持首杀率，可以改用战队 KD。');
  assert.deepEqual(evidence.warnings, ['当前数据库不支持用户所问的指标。只说明该指标无法查询，不要推荐替代指标。']);
  assert.equal(
    clarificationEvidence('团战首杀率不在当前支持的指标列表中。').warnings[0],
    '当前数据库不支持用户所问的指标。只说明该指标无法查询，不要推荐替代指标。'
  );
});

test('grounds model plans in the conversation and known season catalog', () => {
  const hallucinated = {
    ...plan,
    seasonId: 13,
    seasonName: '国服',
    stageId: 999,
    stageName: '常规赛',
    filters: {
      ...plan.filters,
      playerNames: ['选手A'],
      teamNames: ['国服战队'],
      dateFrom: '2026-01-01',
      dateTo: '2026-06-30'
    },
    minimumMaps: 1,
    minimumMinutes: 120
  };
  const catalog = [{ id: 13, name: '2026 OWCS 国服赛区第二阶段', stages: [] }];
  groundPlan(hallucinated, [{ role: 'user', content: '2026 OWCS 国服第二阶段输出位每10分钟伤害前五名是谁？' }], catalog);

  assert.equal(hallucinated.seasonName, '2026 OWCS 国服赛区第二阶段');
  assert.equal(hallucinated.stageId, 0);
  assert.equal(hallucinated.stageName, '');
  assert.deepEqual(hallucinated.filters.playerNames, []);
  assert.deepEqual(hallucinated.filters.teamNames, []);
  assert.deepEqual(hallucinated.filters.roles, ['damage']);
  assert.equal(hallucinated.filters.dateFrom, '');
  assert.equal(hallucinated.filters.dateTo, '');
  assert.equal(hallucinated.minimumMaps, 0);
  assert.equal(hallucinated.minimumMinutes, 0);
});

test('turns an unsupported planned metric into a composed capability answer', async () => {
  const calls = [];
  const client = {
    callTool: async ({ tool }) => {
      calls.push(tool.function.name);
      if (tool.function.name === 'build_query_plan') {
        return { value: { ...plan, metric: 'first_kill_rate' }, usage: { total_tokens: 10 } };
      }
      return {
        value: {
          answer: '当前数据库助手尚不支持首杀率统计，可以改问比赛胜率或地图胜率。',
          confidence: 'low',
          followUps: ['查询战队 KD 排名']
        },
        usage: { total_tokens: 12 }
      };
    }
  };
  const service = new AgentService({
    client,
    executor: { execute: async () => assert.fail('clarification must not execute analytics') },
    Season: { findAll: async () => [] },
    SeasonStage: { findAll: async () => [] }
  });

  const result = await service.ask({ messages: [{ role: 'user', content: '谁的首杀率最高？' }] });
  assert.deepEqual(calls, ['build_query_plan', 'build_query_plan', 'deliver_answer']);
  assert.equal(result.answer, '当前数据库暂不支持这个统计指标，因此无法可靠回答。你可以换一个统计口径后再问。');
  assert.equal(result.confidence, 'high');
  assert.deepEqual(result.followUps, []);
});

test('tags planning failures with a trace id for diagnosis', async () => {
  const service = new AgentService({
    client: { callTool: async () => { throw new Error('provider unavailable'); } },
    Season: { findAll: async () => [] },
    SeasonStage: { findAll: async () => [] }
  });

  await assert.rejects(
    service.ask({ messages: [{ role: 'user', content: '查询排名' }] }),
    error => error.agentStage === 'planning' && /^[0-9a-f-]{36}$/.test(error.traceId)
  );
});
