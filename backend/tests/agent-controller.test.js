const test = require('node:test');
const assert = require('node:assert/strict');
const { _private: { publicAgentError } } = require('../controllers/AgentController');

test('classifies model timeout and provider overload without exposing internals', () => {
  const timeout = Object.assign(new Error('模型服务请求超时'), { code: 'MODEL_TIMEOUT' });
  assert.deepEqual(publicAgentError(timeout), {
    status: 504,
    message: '模型本次响应超时，问题已保留，请点击重试。'
  });

  const busy = Object.assign(new Error('internal provider detail'), {
    code: 'MODEL_HTTP_ERROR',
    providerStatus: 503
  });
  assert.deepEqual(publicAgentError(busy), {
    status: 503,
    message: '模型服务当前繁忙，问题已保留，请稍后点击重试。'
  });
});

test('classifies analytics failures separately from model failures', () => {
  const analytics = Object.assign(new Error('database detail'), { agentStage: 'analytics' });
  assert.deepEqual(publicAgentError(analytics), {
    status: 502,
    message: '赛事数据读取失败，请稍后重试。'
  });
});
