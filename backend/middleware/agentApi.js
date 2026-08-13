const crypto = require('crypto');
const { AgentApiError } = require('../controllers/AgentApiController');

const agentRequestContext = (req, res, next) => {
  res.locals.requestId = req.get('x-request-id') || crypto.randomUUID();
  res.set('x-request-id', res.locals.requestId);
  next();
};

const asyncAgentHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const agentApiErrorHandler = (error, req, res, _next) => {
  if (error instanceof AgentApiError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.field ? { field: error.field } : {})
      }
    });
  }
  console.error(`[agent-api] ${req.method} ${req.originalUrl}:`, error);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Agent API request failed'
    }
  });
};

module.exports = {
  agentApiErrorHandler,
  agentRequestContext,
  asyncAgentHandler
};
