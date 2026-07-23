class ChatModelClient {
  constructor(options = {}) {
    this.provider = options.provider || process.env.AI_AGENT_PROVIDER || 'siliconflow';
    this.apiKey = options.apiKey || process.env.AI_AGENT_API_KEY;
    this.baseUrl = String(options.baseUrl || process.env.AI_AGENT_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/$/, '');
    this.model = options.model || process.env.AI_AGENT_MODEL || 'Qwen/Qwen3.5-4B';
    this.timeoutMs = Number(options.timeoutMs || process.env.AI_TIMEOUT_MS || 20000);
    this.fetch = options.fetch || global.fetch;
  }

  requestTool(tool) {
    if (this.provider === 'zhipu') {
      const { strict, ...callable } = tool.function;
      return { ...tool, function: callable };
    }
    if (this.provider === 'siliconflow') {
      return { ...tool, function: { ...tool.function, strict: false } };
    }
    return tool;
  }

  requestBody({ messages, tool, maxTokens }) {
    const body = {
      model: this.model,
      messages,
      tools: [this.requestTool(tool)],
      max_tokens: maxTokens,
      stream: false
    };
    if (this.provider === 'zhipu') {
      body.thinking = { type: 'disabled' };
      body.tool_choice = { type: 'function', function: { name: tool.function.name } };
      body.do_sample = false;
    } else if (this.provider === 'siliconflow') {
      body.enable_thinking = false;
      body.tool_choice = { type: 'function', function: { name: tool.function.name } };
      body.temperature = 0.1;
    } else {
      body.tool_choice = { type: 'function', function: { name: tool.function.name } };
    }
    return body;
  }

  async callTool({ messages, tool, maxTokens = 600 }) {
    if (!this.apiKey) throw new Error('尚未配置赛事数据助手 API Key');
    if (typeof this.fetch !== 'function') throw new Error('当前 Node.js 运行环境不支持 fetch');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(this.requestBody({ messages, tool, maxTokens })),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const providerMessage = payload?.error?.message || `HTTP ${response.status}`;
        const error = new Error(`模型服务请求失败（HTTP ${response.status}）：${providerMessage}`);
        error.code = 'MODEL_HTTP_ERROR';
        error.providerStatus = response.status;
        throw error;
      }
      const message = payload?.choices?.[0]?.message;
      const call = message?.tool_calls?.find(item => item?.function?.name === tool.function.name);
      if (!call?.function?.arguments) throw new Error('模型没有返回预期的结构化结果');
      let value;
      try {
        value = JSON.parse(call.function.arguments);
      } catch {
        throw new Error('模型返回了无法解析的结构化结果');
      }
      return { value, usage: payload.usage || {} };
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('模型服务请求超时');
        timeoutError.code = 'MODEL_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = ChatModelClient;
