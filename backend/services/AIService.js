const OpenAI = require("openai");

class AIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL,
    });
    this.model = process.env.AI_MODEL || "qwen-plus";
  }

  /**
   * 获取列映射关系
   * @param {string[]} headers Excel表头
   * @param {Array} sampleData 样本数据（前几行）
   * @returns {Promise<Object>} 字段映射关系 { standardField: excelHeader }
   */
  async getColumnMapping(headers, sampleData) {
    if (!process.env.AI_API_KEY) {
      throw new Error("AI API Key not configured");
    }

    const standardFields = [
      { key: "playerName", desc: "选手名称 (Player Name)" },
      { key: "teamName", desc: "队伍名称 (Team Name)" },
      { key: "role", desc: "职责/位置 (Role/Position: Tank, Damage, Support)" },
      { key: "elims", desc: "击杀数 (Eliminations)" },
      { key: "assists", desc: "助攻数 (Assists)" },
      { key: "deaths", desc: "阵亡数 (Deaths)" },
      { key: "damage", desc: "伤害量 (Damage/Hero Damage)" },
      { key: "healing", desc: "治疗量 (Healing)" },
      { key: "mitigation", desc: "格挡量 (Mitigation)" },
      { key: "gameTime", desc: "游戏时长 (Game Time)" },
      { key: "kd", desc: "击杀阵亡比 (K/D)" },
      { key: "kad", desc: "击杀助攻阵亡比 (KA/D)" },
      { key: "elimsPerMin", desc: "每分钟击杀 (Elims/Min)" },
      { key: "assistsPerMin", desc: "每分钟助攻 (Assists/Min)" },
      { key: "deathsPerMin", desc: "每分钟阵亡 (Deaths/Min)" },
      { key: "damagePerMin", desc: "每分钟伤害 (Damage/Min)" },
      { key: "mitigationPerMin", desc: "每分钟格挡 (Mitigation/Min)" },
      { key: "healingPerMin", desc: "每分钟治疗 (Healing/Min)" },
    ];

    const prompt = `
你是一个数据分析助手。请根据提供的 Excel 表头和样本数据，推断它们与标准字段的映射关系。

标准字段列表：
${standardFields.map((f) => `- ${f.key}: ${f.desc}`).join("\n")}

Excel 表头：
${JSON.stringify(headers)}

样本数据（前3行）：
${JSON.stringify(sampleData)}

请返回一个 JSON 对象，键是标准字段的 key，值是 Excel 表头中对应的列名。
如果某个标准字段在 Excel 中找不到对应的列，请不要包含在返回的 JSON 中。
请确保返回的是纯 JSON 格式，不要包含任何 Markdown 标记或解释性文字。

例如：
{
  "playerName": "Player",
  "teamName": "Team",
  "elims": "Eliminations"
}
`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      });

      const content = response.choices[0].message.content.trim();
      // 尝试解析 JSON，处理可能存在的 Markdown 代码块标记
      const jsonStr = content.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error("AI Mapping Error:", error);
      throw new Error("AI 解析失败: " + error.message);
    }
  }
}

module.exports = new AIService();
