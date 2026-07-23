const AgentService = require('../services/agent/AgentService');

const service = new AgentService();
const buckets = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 20);

const allowRequest = key => {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1;
  return true;
};

const publicAgentError = error => {
  const message = error?.message || '';
  const isInputError = /messages|最后一条消息/.test(message);
  const budgetExceeded = error?.code === 'AI_BUDGET_EXCEEDED';
  const timedOut = error?.code === 'MODEL_TIMEOUT' || /请求超时/.test(message);
  const providerStatus = Number(error?.providerStatus) || 0;
  const providerBusy = error?.code === 'MODEL_HTTP_ERROR'
    && (providerStatus === 429 || providerStatus >= 500);

  if (isInputError) return { status: 400, message };
  if (budgetExceeded) return { status: 429, message };
  if (timedOut) return { status: 504, message: '模型本次响应超时，问题已保留，请点击重试。' };
  if (providerBusy) return { status: 503, message: '模型服务当前繁忙，问题已保留，请稍后点击重试。' };
  if (error?.agentStage === 'analytics' || error?.agentStage === 'catalog') {
    return { status: 502, message: '赛事数据读取失败，请稍后重试。' };
  }
  return { status: 502, message: '模型没有完成本次回答，请点击重试。' };
};

const AgentController = {
  status: (req, res) => res.json({
    configured: Boolean(process.env.AI_AGENT_API_KEY),
    model: process.env.AI_AGENT_MODEL || 'Qwen/Qwen3.5-4B',
    budget: service.budgetStatus()
  }),

  chat: async (req, res) => {
    const clientKey = String(req.ip || req.socket?.remoteAddress || 'unknown');
    if (!allowRequest(clientKey)) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试。' });
    }
    try {
      const result = await service.ask(req.body || {});
      return res.json(result);
    } catch (error) {
      const publicError = publicAgentError(error);
      console.error('[agent:error]', JSON.stringify({ traceId: error.traceId || null, stage: error.agentStage || 'unknown', message: error.message }));
      return res.status(publicError.status).json({
        error: publicError.message,
        traceId: error.traceId || null
      });
    }
  }
};

module.exports = AgentController;
module.exports._private = { allowRequest, buckets, publicAgentError };
