const express = require('express');
const router = express.Router();
const AIReportController = require('../controllers/AIReportController');

// 极简邀请码中间件
const inviteCodeMiddleware = (req, res, next) => {
  // 允许两种邀请码通过验证：
  // 1. 用户在 .env 中自定义的外部访客邀请码 (AI_INVITE_CODE)
  // 2. 后台管理页面内置的固定通信密钥 (ADMIN-INTERNAL-KEY)
  const guestCode = process.env.AI_INVITE_CODE || 'OWCS-TEST-888';
  const adminCode = 'ADMIN-INTERNAL-KEY';
  
  const providedCode = req.headers['x-invite-code'];
  
  if (providedCode === guestCode || providedCode === adminCode) {
    next();
  } else {
    res.status(403).json({ error: '无效的邀请码或未授权访问' });
  }
};

// @route   POST /api/ai-reports/chat
// @desc    与 LangChain Agent 智能问答，生成并执行 SQL
// @access  Private (Protected by Invite Code)
router.post('/chat', inviteCodeMiddleware, AIReportController.chat.bind(AIReportController));

module.exports = router;