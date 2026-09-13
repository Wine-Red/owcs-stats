import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

export const configSchema = z.object({
  protocol: z.enum(['openai', 'anthropic']),
  baseUrl: z.string().url().transform(v => {
    // Accept a base URL or a pasted full endpoint; canonicalize once on save.
    return v.trim().replace(/\/+$/, '').replace(/\/(chat\/completions|messages)$/, '');
  }).refine(v => {
    const u = new URL(v);
    return !u.username && !u.password && !u.search && !u.hash &&
      (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)));
  }, '请填写 HTTPS 服务地址；本机模型可以使用 HTTP'),
  model: z.string().trim().min(1).max(180),
  apiKey: z.string().max(4096).default(''),
  maxTokens: z.coerce.number().int().min(256).max(16000).default(2048),
  dotsThinking: z.enum(['default', 'off', 'on']).default('default'),
});
const displaySchema = z.object({ showInVisualize: z.boolean() }).strict();

export function createSettings(directory) {
  mkdirSync(directory, { recursive: true });
  const keyFile = path.join(directory, 'key'), file = path.join(directory, 'settings.json');
  const displayFile = path.join(directory, 'display.json');
  if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: 'wx' });
  const key = readFileSync(keyFile);
  const read = () => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const encrypt = value => {
    const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
    return Buffer.concat([iv, c.update(value), c.final(), c.getAuthTag()]).toString('base64');
  };
  return {
    getDisplay() {
      return existsSync(displayFile) ? displaySchema.parse(JSON.parse(readFileSync(displayFile, 'utf8'))) : { showInVisualize: true };
    },
    saveDisplay(input) {
      const value = displaySchema.parse(input);
      writeFileSync(displayFile + '.tmp', JSON.stringify(value), { mode: 0o600 });
      renameSync(displayFile + '.tmp', displayFile);
      return value;
    },
    get(secret = false) {
      const p = read();
      if (!p) return null;
      const { apiKey, ...rest } = p;
      if (!secret) return { ...rest, hasKey: !!apiKey };
      const bytes = Buffer.from(apiKey, 'base64'), d = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      d.setAuthTag(bytes.subarray(-16));
      return { ...rest, apiKey: Buffer.concat([d.update(bytes.subarray(12, -16)), d.final()]).toString() };
    },
    save(input) {
      const p = configSchema.parse(input), previous = read();
      if (!p.apiKey && !previous?.apiKey) throw new Error('首次配置需要填写 API Key');
      const value = { ...p, apiKey: p.apiKey ? encrypt(p.apiKey) : previous.apiKey };
      writeFileSync(file + '.tmp', JSON.stringify(value), { mode: 0o600 });
      renameSync(file + '.tmp', file);
      return this.get();
    },
  };
}
