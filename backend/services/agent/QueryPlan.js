const { SUBJECTS, ALL_METRIC_NAMES, hasMetric } = require('./MetricRegistry');

const INTENTS = new Set(['query', 'compare', 'clarify']);
const SORT_DIRECTIONS = new Set(['asc', 'desc']);
const ROLES = new Set(['tank', 'damage', 'support']);

const text = (value, max = 120) => String(value || '').trim().slice(0, max);
const integer = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};
const stringArray = (value, maxItems = 8) => Array.isArray(value)
  ? value.map(item => text(item, 80)).filter(Boolean).slice(0, maxItems)
  : [];

const validateQueryPlan = raw => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('模型没有返回有效的查询计划');
  }

  const intent = INTENTS.has(raw.intent) ? raw.intent : 'clarify';
  const subject = SUBJECTS.includes(raw.subject) ? raw.subject : 'match';
  const metric = text(raw.metric, 60);
  if (intent !== 'clarify' && !hasMetric(subject, metric)) {
    throw new Error(`不支持指标 ${subject}.${metric || '(empty)'}`);
  }

  const filters = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
  const plan = {
    intent,
    subject,
    metric: intent === 'clarify' ? '' : metric,
    seasonId: integer(raw.seasonId, 0, Number.MAX_SAFE_INTEGER, 0),
    seasonName: text(raw.seasonName, 120),
    stageId: integer(raw.stageId, 0, Number.MAX_SAFE_INTEGER, 0),
    stageName: text(raw.stageName, 120),
    filters: {
      playerNames: stringArray(filters.playerNames),
      teamNames: stringArray(filters.teamNames),
      heroNames: stringArray(filters.heroNames),
      mapNames: stringArray(filters.mapNames),
      roles: stringArray(filters.roles, 3).filter(role => ROLES.has(role)),
      mapTypes: stringArray(filters.mapTypes, 8),
      dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom || '') ? filters.dateFrom : '',
      dateTo: /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo || '') ? filters.dateTo : ''
    },
    minimumMaps: integer(raw.minimumMaps, 0, 1000, 0),
    minimumMinutes: integer(raw.minimumMinutes, 0, 100000, 0),
    sortDirection: SORT_DIRECTIONS.has(raw.sortDirection) ? raw.sortDirection : 'desc',
    limit: integer(raw.limit, 1, 20, 10),
    questionSummary: text(raw.questionSummary, 200),
    clarificationReason: text(raw.clarificationReason, 240)
  };

  if (intent === 'clarify' && !plan.clarificationReason) {
    plan.clarificationReason = '需要补充查询范围或统计指标。';
  }
  return plan;
};

const nullableString = { type: 'string' };
const stringList = { type: 'array', items: { type: 'string' }, maxItems: 8 };

const QUERY_PLAN_TOOL = Object.freeze({
  type: 'function',
  function: {
    name: 'build_query_plan',
    description: '把赛事数据问题转换成后端可执行的受控查询计划。不能生成 SQL。',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        intent: { type: 'string', enum: ['query', 'compare', 'clarify'] },
        subject: { type: 'string', enum: ['player', 'team', 'map', 'hero', 'match'] },
        metric: { type: 'string', enum: ['', ...ALL_METRIC_NAMES] },
        seasonId: { type: 'integer', minimum: 0 },
        seasonName: nullableString,
        stageId: { type: 'integer', minimum: 0 },
        stageName: nullableString,
        filters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            playerNames: stringList,
            teamNames: stringList,
            heroNames: stringList,
            mapNames: stringList,
            roles: { type: 'array', items: { type: 'string', enum: ['tank', 'damage', 'support'] }, maxItems: 3 },
            mapTypes: stringList,
            dateFrom: nullableString,
            dateTo: nullableString
          },
          required: ['playerNames', 'teamNames', 'heroNames', 'mapNames', 'roles', 'mapTypes', 'dateFrom', 'dateTo']
        },
        minimumMaps: { type: 'integer', minimum: 0 },
        minimumMinutes: { type: 'integer', minimum: 0 },
        sortDirection: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
        questionSummary: nullableString,
        clarificationReason: nullableString
      },
      required: ['intent', 'subject', 'metric', 'seasonId', 'seasonName', 'stageId', 'stageName', 'filters', 'minimumMaps', 'minimumMinutes', 'sortDirection', 'limit', 'questionSummary', 'clarificationReason']
    }
  }
});

module.exports = { validateQueryPlan, QUERY_PLAN_TOOL };
