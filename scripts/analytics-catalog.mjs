import { readFile, writeFile } from 'node:fs/promises';
import { EVENTS, FIELDS, SCHEMA_VERSION } from '../src/analytics/catalog.mjs';
const target = new URL('../docs/analytics-events.md', import.meta.url);
const content = `# OWCS Stats 事件字典（口径 ${SCHEMA_VERSION}）\n\n由 \`npm run docs:analytics\` 从 \`src/analytics/catalog.mjs\` 生成。公共上下文包括页面、赛事、赛段、对阵、选手、战队、地图（按当前页面实际可用数据携带），以及相应追溯 ID。所有事件包含口径版本。\n\n| 代码键 | Umami 事件名 | 专属字段 | 业务含义 |\n| --- | --- | --- | --- |\n${Object.entries(EVENTS).map(([key, event]) => `| \`${key}\` | ${event.name} | ${event.fields.map(field => FIELDS[field]).join('、') || '无'} | ${event.purpose} |`).join('\n')}\n`;
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== content) throw new Error('事件字典已过期，请运行 npm run docs:analytics');
} else await writeFile(target, content);
