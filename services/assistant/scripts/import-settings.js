// One-time local migration. No runtime dependency on the retired prototype.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSettings } from '../server/settings.js';
const source = process.argv[2];
if (!source) throw new Error('请提供旧助手的 .data 目录');
const settings = createSettings(fileURLToPath(new URL('../../../.local/assistant/', import.meta.url)));
if (settings.get()) throw new Error('已有配置，未覆盖；请使用管理页调整。');
const db = new DatabaseSync(path.join(source, 'assistant.sqlite'), { readOnly: true });
try {
  const p = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='provider'").get()?.value || 'null');
  if (!p) throw new Error('旧项目没有模型配置');
  const bytes = Buffer.from(p.apiKey, 'base64'), key = readFileSync(path.join(source, 'encryption.key'));
  const d = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); d.setAuthTag(bytes.subarray(-16));
  const apiKey = Buffer.concat([d.update(bytes.subarray(12, -16)), d.final()]).toString();
  settings.save({ ...p, apiKey });
  console.log('已迁移模型配置并重新加密；未迁移聊天、账号或会话。');
} finally { db.close(); }
