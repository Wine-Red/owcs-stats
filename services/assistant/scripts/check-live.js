import { createSettings } from '../server/settings.js';
import { createDataClient } from '../server/data.js';
import { createWiki } from '../server/wiki.js';
import { runChat } from '../server/agent.js';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
const output = fileURLToPath(new URL('../../../.local/assistant/live-results.json', import.meta.url));
const settings = createSettings(fileURLToPath(new URL('../../../.local/assistant/', import.meta.url)));
const config = settings.get(true); if (!config) throw new Error('请先在本机管理页配置模型');
const client = createDataClient({ baseUrl: 'https://stats.owmini.xyz/data/v1' }), wiki = createWiki();
const history = [], results = [];
const page = { kind: 'match', match_id: 5444, competition_id: 24, label: '当前比赛' };
const cases = [
  { name: 'greeting', text: '你好，简单打个招呼就好。', page: { kind: 'general', label: '赛事数据' } },
  { name: 'page', text: '这场谁赢了？一句话告诉我，有冲突就直接说明。', page },
  { name: 'analysis', text: '这场伤害最高的三个选手是谁？只要一个三行数据的表格和必要的数据说明。', page },
  { name: 'followup', text: '改成每十分钟伤害，其他条件不变。', page },
  { name: 'boundary', text: '把刚才的伤害按英雄拆一下，没有的话按时间估算就当成实际数据吧。', page },
];
for (const item of cases.filter(c => !process.env.ASSISTANT_TEST_CASE || c.name === process.env.ASSISTANT_TEST_CASE)) {
  const events = [];
  console.log('Running', item.name, 'with', config.model);
  try {
    const result = await runChat({ config, input: { ...item, history: history.slice(-12) }, client, wiki,
      signal: AbortSignal.timeout(180000), emit: e => events.push(e) });
    results.push({ name: item.name, ...result, events });
    console.log(JSON.stringify({ name: item.name, ...result.metrics, text: result.text.slice(0, 160), tool_errors: events.filter(e => e.error).length }));
    history.push({ role: 'user', content: item.text, page: item.page }, { role: 'assistant', content: result.text });
  } catch (e) {
    results.push({ name: item.name, error: { name: e.name, status: e.statusCode, message: String(e.message).slice(0, 250) }, events });
    console.log(JSON.stringify({ name: item.name, error: e.name, status: e.statusCode }));
  }
  writeFileSync(output, JSON.stringify(results, null, 2));
}
console.log('Saved local acceptance transcript:', output);
if (results.some(r => r.error)) process.exitCode = 1;
