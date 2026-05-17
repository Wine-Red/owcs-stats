const AIAgentService = require('../services/AIAgentService');

class AIReportController {
  /**
   * 处理来自前端的自然语言查询请求
   */
  async chat(req, res) {
    try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages must be a valid array' });
      }

      // 调用 LangChain Agent 运行查询
      const aiResponse = await AIAgentService.chat(messages);

      // 返回 { reply: "总结文本", sql: "执行的SQL", data: [...] }
      return res.status(200).json(aiResponse);

    } catch (error) {
      console.error('[AIReportController] 聊天请求报错:', error);

      res.status(500).json({ error: '系统内部错误，AI Agent 处理失败: ' + error.message });
    }
  }
}

module.exports = new AIReportController();