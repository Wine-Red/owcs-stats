import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync, statSync, rmSync } from 'node:fs';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';
import path from 'node:path';

// Separate from operational logs and model credentials. No visitor IP or cookie is stored.
export function createConversations(directory, { days = 90, maxRecords = 2000, now = Date.now } = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyPath = path.join(directory, 'conversations.key');
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
  const key = readFileSync(keyPath);
  const folder = path.join(directory, 'conversations');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = id => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid record ID');
    return path.join(folder, `${id}.enc`);
  };
  const entries = () => readdirSync(folder).filter(n => /^[0-9a-f-]{36}\.enc$/.test(n))
    .map(name => ({ id: name.slice(0, -4), time: statSync(path.join(folder, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  const prune = () => {
    for (const [i, entry] of entries().entries()) if (i >= maxRecords || entry.time < now() - days * 86400000) rmSync(file(entry.id), { force: true });
  };
  const get = id => {
    const p = file(id);
    if (!existsSync(p)) return null;
    const bytes = readFileSync(p), cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
  };
  prune();
  return {
    prune,
    save(record) {
      const id = randomUUID(), value = { ...record, id, recordedAt: new Date(now()).toISOString() };
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      const target = file(id);
      writeFileSync(`${target}.tmp`, Buffer.concat([iv, cipher.getAuthTag(), data]), { mode: 0o600 });
      renameSync(`${target}.tmp`, target); prune(); return id;
    },
    list(offset = 0) {
      prune(); const all = entries();
      return { total: all.length, offset, limit: 25, retentionDays: days, maxRecords,
        items: all.slice(offset, offset + 25).map(({ id }) => {
          const r = get(id);
          return { id, recordedAt: r.recordedAt, text: r.text.slice(0, 180), status: r.status, model: r.model, origin: r.origin, metrics: r.metrics, conversationId: r.conversationId };
        }) };
    },
    get(id) { prune(); return get(id); },
    remove(id) { rmSync(file(id), { force: true }); },
  };
}
