const { ChatOpenAI } = require("@langchain/openai");
const { DynamicStructuredTool } = require("@langchain/core/tools");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { SystemMessage, HumanMessage } = require("@langchain/core/messages");
const { z } = require("zod");
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

class AIAgentService {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY;
    this.baseUrl = process.env.DEEPSEEK_BASE_URL || process.env.AI_BASE_URL || 'https://api.deepseek.com/v1';
    this.modelName = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    
    if (!this.apiKey) {
      console.warn("WARNING: DEEPSEEK_API_KEY or AI_API_KEY is not set.");
    }

    this.llm = new ChatOpenAI({
      openAIApiKey: this.apiKey,
      modelName: this.modelName,
      temperature: 0,
      maxRetries: 3, // 增加重试机制，应对 API 偶尔的网络抖动
      configuration: {
        baseURL: this.baseUrl,
      },
    });

    this.schemaString = this._buildDatabaseSchema();
    this.tools = this._createTools();
    this.agent = this._createGraphAgent();
  }

  /**
   * 动态提取 Sequelize 的模型信息，生成精简的 DDL 描述
   */
  _buildDatabaseSchema() {
    let schemaDesc = "数据库结构如下（只读模式）：\n\n";
    for (const [modelName, model] of Object.entries(sequelize.models)) {
      schemaDesc += `表名: ${model.tableName}\n字段:\n`;
      for (const [attrName, attrObj] of Object.entries(model.rawAttributes)) {
        let typeStr = attrObj.type.key || 'UNKNOWN';
        if (typeStr === 'ENUM' && attrObj.type.values) {
          typeStr += `(${attrObj.type.values.join(',')})`;
        }
        const primaryKey = attrObj.primaryKey ? " (主键)" : "";
        schemaDesc += `  - ${attrName} [${typeStr}]${primaryKey}\n`;
      }
      schemaDesc += "\n";
    }
    return schemaDesc;
  }

  /**
   * 创建提供给大模型的工具
   */
  _createTools() {
    const executeSqlTool = new DynamicStructuredTool({
      name: "execute_read_only_sql",
      description: "执行安全的、只读的 MySQL SQL 查询语句并返回结果数据。输入必须是有效的 SQL SELECT 语句。",
      schema: z.object({
        sql: z.string().describe("需要执行的 MySQL SQL 查询语句，必须以 SELECT 开头。"),
      }),
      func: async ({ sql }) => {
        try {
          console.log(`[LangGraph Agent] 尝试执行 SQL: ${sql}`);
          
          const cleanSql = sql.trim();
          
          // 严格的安全校验
          if (!/^SELECT\b/i.test(cleanSql)) {
            return JSON.stringify({ error: "安全拦截：只能执行 SELECT 查询语句。" });
          }
          
          const forbiddenKeywords = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|REPLACE)\b/i;
          if (forbiddenKeywords.test(cleanSql)) {
            return JSON.stringify({ error: "安全拦截：SQL 包含危险关键字，拒绝执行。" });
          }

          // 执行查询 (强制使用 SELECT type 确保只读)
          const results = await sequelize.query(cleanSql, { type: QueryTypes.SELECT });
          
          return JSON.stringify(results);
        } catch (error) {
          console.error(`[LangGraph Agent] SQL 执行报错: ${error.message}`);
          return JSON.stringify({ error: `SQL执行失败: ${error.message}` });
        }
      },
    });

    return [executeSqlTool];
  }

  /**
   * 初始化 LangGraph Agent
   */
  _createGraphAgent() {
    const systemPrompt = `你是一个强大的数据库查询助手和数据分析师。
你的任务是根据用户的自然语言问题，使用提供的工具查询数据库并给出回答。

${this.schemaString}

规则：
1. 必须使用 execute_read_only_sql 工具来查询数据。
2. 只能生成 MySQL 方言的 SELECT 语句。
3. 仔细检查表名和字段名，确保与提供的 Schema 一致。
4. 获取到数据后，用中文给出简明扼要的总结或回答。
5. 永远不要尝试修改或删除数据。`;

    // 使用 LangGraph 的 createReactAgent 创建状态机
    return createReactAgent({
      llm: this.llm,
      tools: this.tools,
      messageModifier: new SystemMessage(systemPrompt),
    });
  }

  /**
   * 处理聊天请求
   * @param {Array} messages - 前端传来的消息数组 [{ role: 'user', content: '...' }]
   * @returns {Object} - { reply: string, sql: string, data: Array }
   */
  async chat(messages) {
    if (!messages || messages.length === 0) {
      throw new Error("Messages cannot be empty");
    }

    const latestMessage = messages[messages.length - 1].content;
    
    let lastExecutedSql = "";
    let lastQueryResult = [];

    // 使用 LangGraph agent 的 invoke 方法
    const result = await this.agent.invoke(
      {
        messages: [new HumanMessage(latestMessage)]
      },
      // 可以在此处传入 config，如 thread_id 实现断点记忆，此处简化处理
      { configurable: { thread_id: Date.now().toString() } }
    );

    // 解析 LangGraph 返回的消息流，提取最后的文本和中间执行的 SQL 及结果
    const finalMessages = result.messages;
    const finalReply = finalMessages[finalMessages.length - 1].content;

    // 遍历图的执行消息，找到工具调用的记录
    for (const msg of finalMessages) {
      // 查找 ToolMessage，其中包含工具的返回结果
      if (msg._getType() === "tool" && msg.name === "execute_read_only_sql") {
        try {
          const parsedData = JSON.parse(msg.content);
          if (!parsedData.error) {
            lastQueryResult = parsedData;
          }
        } catch (e) {
          // parse error
        }
      }
      
      // 查找 AIMessage 中的 tool_calls，提取传入的 SQL
      if (msg._getType() === "ai" && msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          if (tc.name === "execute_read_only_sql" && tc.args && tc.args.sql) {
            lastExecutedSql = tc.args.sql;
          }
        }
      }
    }

    return {
      reply: finalReply,
      sql: lastExecutedSql,
      data: lastQueryResult
    };
  }
}

module.exports = new AIAgentService();