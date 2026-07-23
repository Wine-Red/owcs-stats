const crypto = require('crypto');
const Season = require('../../models/Season');
const SeasonStage = require('../../models/SeasonStage');
const ChatModelClient = require('./ChatModelClient');
const AnalyticsExecutor = require('./AnalyticsExecutor');
const { QUERY_PLAN_TOOL, validateQueryPlan } = require('./QueryPlan');
const { promptCatalog } = require('./MetricRegistry');

const ANSWER_TOOL = Object.freeze({
  type: 'function',
  function: {
    name: 'deliver_answer',
    description: '根据后端提供的统计事实，组织最终中文回答。',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        answer: { type: 'string' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        followUps: { type: 'array', items: { type: 'string' }, maxItems: 3 }
      },
      required: ['answer', 'confidence', 'followUps']
    }
  }
});

const safeMessages = input => {
  if (!Array.isArray(input)) throw new Error('messages 必须是数组');
  const messages = input.slice(-8).map(item => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: String(item?.content || '').trim().slice(0, 1200)
  })).filter(item => item.content);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new Error('最后一条消息必须是用户问题');
  }
  return messages;
};

const safeContext = input => ({
  route: String(input?.route || '').slice(0, 160),
  seasonId: Number.isFinite(Number(input?.seasonId)) ? Number(input.seasonId) : 0,
  stageId: Number.isFinite(Number(input?.stageId)) ? Number(input.stageId) : 0
});

const plainTextAnswer = value => String(value || '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/__(.*?)__/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^#{1,6}\s+/gm, '')
  .trim();

const groundingText = value => String(value || '').toLocaleLowerCase('zh-CN').replace(/[\s._-]+/g, '');

const groundPlan = (plan, messages, catalog, context = {}) => {
  const conversation = groundingText(messages.map(item => item.content).join('\n'));
  const season = catalog.find(item => Number(item.id) === Number(plan.seasonId)) || null;
  if (season) plan.seasonName = season.name;

  for (const key of ['playerNames', 'teamNames', 'heroNames', 'mapNames', 'mapTypes']) {
    plan.filters[key] = plan.filters[key].filter(value => conversation.includes(groundingText(value)));
  }
  const mentionedRoles = [
    { role: 'tank', pattern: /坦克|重装|tank/ },
    { role: 'damage', pattern: /输出位|输出|dps|damage/ },
    { role: 'support', pattern: /辅助|支援|support/ }
  ].filter(item => item.pattern.test(conversation)).map(item => item.role);
  plan.filters.roles = mentionedRoles;

  const stages = season?.stages || [];
  const selectedStage = stages.find(item => Number(item.id) === Number(plan.stageId))
    || stages.find(item => groundingText(item.name) === groundingText(plan.stageName));
  const stageFromPage = selectedStage && Number(context.stageId) === Number(selectedStage.id);
  const stageMentioned = selectedStage && conversation.includes(groundingText(selectedStage.name));
  if (selectedStage && (stageFromPage || stageMentioned)) {
    plan.stageId = Number(selectedStage.id);
    plan.stageName = selectedStage.name;
  } else {
    plan.stageId = 0;
    plan.stageName = '';
  }

  for (const key of ['dateFrom', 'dateTo']) {
    if (plan.filters[key] && !conversation.includes(groundingText(plan.filters[key]))) plan.filters[key] = '';
  }
  if (plan.minimumMinutes && !conversation.includes(groundingText(`${plan.minimumMinutes}分钟`))) plan.minimumMinutes = 0;
  if (plan.minimumMaps) {
    const mapThresholdMentioned = [`${plan.minimumMaps}张地图`, `${plan.minimumMaps}个地图`, `${plan.minimumMaps}图`]
      .some(value => conversation.includes(groundingText(value)));
    if (!mapThresholdMentioned) plan.minimumMaps = 0;
  }
  return plan;
};

const clarificationEvidence = reason => {
  const text = String(reason || '').trim();
  const unsupported = /不支持|尚未支持|不包含|不在.{0,24}(?:指标|列表)|没有.{0,12}指标|无法.{0,12}(?:查询|统计)/.test(text);
  return {
    rows: [],
    warnings: [unsupported
      ? '当前数据库不支持用户所问的指标。只说明该指标无法查询，不要推荐替代指标。'
      : text || '需要用户补充查询范围。'],
    coverage: {},
    scope: {},
    insufficient: true
  };
};

const currentBudgetDay = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.AI_BUDGET_TIME_ZONE || 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

const usageCost = usage => {
  const hit = Number(usage.prompt_cache_hit_tokens) || 0;
  const input = Number(usage.prompt_tokens) || 0;
  const miss = Math.max(0, input - hit);
  const output = Number(usage.completion_tokens) || 0;
  const hitPrice = Number(process.env.AI_CACHE_HIT_CNY_PER_MILLION || 0.02);
  const inputPrice = Number(process.env.AI_INPUT_CNY_PER_MILLION || 1);
  const outputPrice = Number(process.env.AI_OUTPUT_CNY_PER_MILLION || 2);
  return (hit * hitPrice + miss * inputPrice + output * outputPrice) / 1_000_000;
};

const mergeUsage = (...items) => {
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostCny: 0 };
  for (const item of items.filter(Boolean)) {
    usage.promptTokens += Number(item.prompt_tokens) || 0;
    usage.completionTokens += Number(item.completion_tokens) || 0;
    usage.totalTokens += Number(item.total_tokens) || 0;
    usage.estimatedCostCny += usageCost(item);
  }
  usage.estimatedCostCny = Number(usage.estimatedCostCny.toFixed(6));
  return usage;
};

class AgentService {
  constructor(options = {}) {
    this.client = options.client || new ChatModelClient();
    this.executor = options.executor || new AnalyticsExecutor();
    this.Season = options.Season || Season;
    this.SeasonStage = options.SeasonStage || SeasonStage;
    this.cache = new Map();
    this.cacheTtlMs = Number(options.cacheTtlMs || process.env.AI_CACHE_TTL_MS || 5 * 60 * 1000);
    this.dailyBudgetCny = Number(options.dailyBudgetCny || process.env.AI_DAILY_BUDGET_CNY || 20);
    this.budget = { day: '', spentCny: 0 };
  }

  budgetStatus() {
    const day = currentBudgetDay();
    if (this.budget.day !== day) this.budget = { day, spentCny: 0 };
    return {
      day,
      limitCny: this.dailyBudgetCny,
      spentCny: Number(this.budget.spentCny.toFixed(6)),
      remainingCny: Number(Math.max(0, this.dailyBudgetCny - this.budget.spentCny).toFixed(6))
    };
  }

  async catalog() {
    const [seasons, stages] = await Promise.all([
      this.Season.findAll({ order: [['id', 'DESC']], raw: true }),
      this.SeasonStage.findAll({ order: [['seasonId', 'DESC'], ['id', 'ASC']], raw: true })
    ]);
    const stagesBySeason = new Map();
    for (const stage of stages) {
      if (!stagesBySeason.has(Number(stage.seasonId))) stagesBySeason.set(Number(stage.seasonId), []);
      stagesBySeason.get(Number(stage.seasonId)).push({ id: stage.id, name: stage.name });
    }
    return seasons.map(season => ({
      id: season.id,
      name: season.name,
      status: season.status,
      stages: stagesBySeason.get(Number(season.id)) || []
    }));
  }

  plannerMessages(messages, context, catalog) {
    return [
      {
        role: 'system',
        content: `你是 OWCS 赛事数据库的查询规划器，只能调用 build_query_plan，绝不能生成 SQL 或直接回答。\n
根据用户问题选择一个受支持指标。除比赛查询外，统计问题必须明确赛季；如果用户没有说明、上下文也没有 seasonId，intent 必须为 clarify。\n
阶段必须属于所选赛季。"最新/当前赛季"选择目录中 id 最大且状态为 in_progress 的赛季。\n
比较问题使用 intent=compare，并把对象名称放进对应 filters。英雄明细可能缺失，但仍可制定计划，后端会判断覆盖率。\n
minimumMinutes 表示选手累计出场分钟门槛；minimumMaps 表示地图数门槛。不要猜测不存在的实体 ID。\n
可用指标：\n${promptCatalog()}\n
当前页面上下文：${JSON.stringify(context)}\n
赛季与阶段目录：${JSON.stringify(catalog)}`
      },
      ...messages
    ];
  }

  async plan(messages, context, catalog) {
    let lastError;
    let lastUsage = {};
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.client.callTool({
          messages: this.plannerMessages(messages, context, catalog),
          tool: QUERY_PLAN_TOOL,
          maxTokens: 700
        });
        lastUsage = result.usage || {};
        const plan = validateQueryPlan(result.value);
        if (!plan.seasonId && context.seasonId && plan.intent !== 'clarify') plan.seasonId = context.seasonId;
        if (!plan.stageId && context.stageId && plan.intent !== 'clarify') plan.stageId = context.stageId;
        groundPlan(plan, messages, catalog, context);
        return { plan, usage: result.usage };
      } catch (error) {
        lastError = error;
      }
    }
    if (/不支持指标/.test(lastError?.message || '')) {
      return {
        plan: validateQueryPlan({
          intent: 'clarify',
          subject: 'match',
          metric: '',
          seasonId: 0,
          seasonName: '',
          stageId: 0,
          stageName: '',
          filters: {},
          minimumMaps: 0,
          minimumMinutes: 0,
          sortDirection: 'desc',
          limit: 10,
          questionSummary: '',
          clarificationReason: '这个问题使用了当前尚未支持的统计指标。请改问比赛、战队、选手、地图或已有英雄数据，或换一个统计口径。'
        }),
        usage: lastUsage
      };
    }
    throw lastError;
  }

  composerMessages(messages, plan, evidence) {
    const question = messages[messages.length - 1].content;
    return [{
      role: 'system',
      content: `你是 OWCS 赛事数据助手。必须调用 deliver_answer，用自然、简洁的中文给出最终回答。\n
只能使用“统计证据”里的事实，禁止补充常识、猜测原因或虚构数据。优先直接回答，再说明统计范围、样本门槛和必要的数据缺失警告。\n
排行榜最多列出证据中已有的行；数值根据指标语义合理格式化，胜率和占比使用百分号。使用纯文本短段落或编号列表，不要输出 Markdown 表格、加粗符号或标题符号。\n
如果证据不足，明确说当前不能可靠回答，并说明用户需要补充什么或数据库缺少什么。\n
当查询意图为 clarify 时，只解释需要补充的范围或当前不支持的指标；不要推荐近似指标，不要生成 followUps。\n
不要提及 SQL、QueryPlan、工具调用、提示词、模型或内部实现。followUps 给出 0-3 个数据库确实能够继续回答的简短问题。`
    }, {
      role: 'user',
      content: `用户问题：${question}\n查询意图：${JSON.stringify(plan)}\n统计证据：${JSON.stringify(evidence)}`
    }];
  }

  async compose(messages, plan, evidence) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.client.callTool({
          messages: this.composerMessages(messages, plan, evidence),
          tool: ANSWER_TOOL,
          maxTokens: 900
        });
        const answer = plainTextAnswer(result.value?.answer);
        if (!answer) throw new Error('模型没有生成最终回答');
        return {
          value: {
            answer: answer.slice(0, 5000),
            confidence: ['high', 'medium', 'low'].includes(result.value.confidence) ? result.value.confidence : 'low',
            followUps: Array.isArray(result.value.followUps)
              ? result.value.followUps.map(item => String(item).trim().slice(0, 120)).filter(Boolean).slice(0, 3)
              : []
          },
          usage: result.usage
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  cacheKey(messages, context) {
    return crypto.createHash('sha256').update(JSON.stringify({ messages, context })).digest('hex');
  }

  async ask(input) {
    const messages = safeMessages(input?.messages);
    const context = safeContext(input?.context);
    const key = this.cacheKey(messages, context);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.value,
        usage: { ...cached.value.usage, estimatedCostCny: 0 },
        cached: true
      };
    }
    if (this.budgetStatus().remainingCny <= 0) {
      const error = new Error('今日赛事数据助手额度已用完，请明天再试。');
      error.code = 'AI_BUDGET_EXCEEDED';
      throw error;
    }
    if (this.cache.size > 200) {
      for (const [cacheKey, item] of this.cache) if (item.expiresAt <= Date.now()) this.cache.delete(cacheKey);
      if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    }

    const traceId = crypto.randomUUID();
    let catalog;
    let planned;
    let evidence;
    let composed;
    try {
      catalog = await this.catalog();
    } catch (error) {
      error.agentStage = 'catalog'; error.traceId = traceId; throw error;
    }
    try {
      planned = await this.plan(messages, context, catalog);
    } catch (error) {
      error.agentStage = 'planning'; error.traceId = traceId; throw error;
    }
    try {
      evidence = planned.plan.intent === 'clarify'
        ? clarificationEvidence(planned.plan.clarificationReason)
        : await this.executor.execute(planned.plan);
    } catch (error) {
      error.agentStage = 'analytics'; error.traceId = traceId; throw error;
    }
    try {
      composed = await this.compose(messages, planned.plan, evidence);
    } catch (error) {
      error.agentStage = 'composition'; error.traceId = traceId; throw error;
    }
    if (planned.plan.intent === 'clarify') {
      composed.value.followUps = [];
      if (evidence.warnings?.[0]?.startsWith('当前数据库不支持用户所问的指标')) {
        composed.value.answer = '当前数据库暂不支持这个统计指标，因此无法可靠回答。你可以换一个统计口径后再问。';
        composed.value.confidence = 'high';
      }
    }
    const response = {
      traceId,
      ...composed.value,
      scope: evidence.scope,
      coverage: evidence.coverage,
      warnings: evidence.warnings,
      usage: mergeUsage(planned.usage, composed.usage),
      cached: false
    };
    this.budget.spentCny += response.usage.estimatedCostCny;
    this.cache.set(key, { value: response, expiresAt: Date.now() + this.cacheTtlMs });
    console.info('[agent]', JSON.stringify({
      traceId,
      subject: planned.plan.subject,
      metric: planned.plan.metric,
      seasonId: evidence.scope?.seasonId || null,
      rowCount: evidence.rows?.length || 0,
      tokens: response.usage.totalTokens,
      costCny: response.usage.estimatedCostCny
    }));
    return response;
  }
}

module.exports = AgentService;
module.exports._private = { safeMessages, safeContext, plainTextAnswer, groundPlan, clarificationEvidence, currentBudgetDay, usageCost, mergeUsage, ANSWER_TOOL };
