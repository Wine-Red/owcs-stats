import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createConversations } from '../server/conversations.js';
import { createApp } from '../server/app.js';

test('records survive restart, are encrypted, expire and stay bounded', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'assistant-records-'));
  let now = Date.now();
  try {
    const store = createConversations(dir, { maxRecords: 2, now: () => now });
    const id = store.save({ text: 'private question', answer: 'private answer' });
    const raw = readFileSync(path.join(dir, 'conversations', `${id}.enc`));
    assert.ok(!raw.includes(Buffer.from('private')));
    assert.equal(createConversations(dir).get(id).answer, 'private answer');
    store.save({ text: 'second' }); store.save({ text: 'third' });
    assert.equal(store.list().total, 2);
    assert.throws(() => store.get('../settings.json'));
    now += 91 * 86400000; assert.equal(store.list().total, 0);
    assert.equal(readdirSync(path.join(dir, 'conversations')).length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('records capture streamed success and failure without configuration secrets and require admin access', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'assistant-http-records-'));
  const store = createConversations(dir);
  const app = createApp({ production: true, partnerOrigins: ['*'], conversations: store,
    settings: { get: () => ({ model: 'test-model', apiKey: 'secret-api-key' }), getDisplay: () => ({}) }, client: { baseUrl: 'https://example.test' },
    runner: async ({ input, emit, signal }) => {
      emit({ type: 'text', text: 'partial reply' });
      if (input.text === 'fail') throw new Error('secret upstream message');
      if (input.text === 'stop') await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      emit({ type: 'done' }); return { metrics: { input_tokens: 12, output_tokens: 3 } };
    } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/assistant/v1`;
  const admin = { Origin: 'https://stats.owmini.xyz', 'Remote-User': 'admin', 'Content-Type': 'application/json' };
  try {
    for (const text of ['hello', 'fail']) { const r = await fetch(base + '/chat', { method: 'POST', headers: { Origin: 'https://partner.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ text, history: [{ role: 'user', content: 'earlier' }] }) }); await r.text(); }
    assert.equal((await fetch(base + '/conversations')).status, 401);
    assert.equal((await fetch(base + '/conversations', { headers: { ...admin, Origin: 'https://partner.test' } })).status, 403);
    const list = await (await fetch(base + '/conversations', { headers: admin })).json(); assert.equal(list.total, 2);
    const records = list.items.map(r => store.get(r.id));
    assert.ok(records.some(r => r.status === 'failed' && r.answer === 'partial reply'));
    assert.ok(records.some(r => r.status === 'completed' && r.metrics.input_tokens === 12));
    assert.equal(records[0].history[0].content, 'earlier');
    assert.ok(!JSON.stringify(records).includes('secret'));
    const id = list.items[0].id;
    assert.equal((await fetch(base + `/conversations/${id}`)).status, 401);
    assert.equal((await fetch(base + `/conversations/${id}`, { method: 'DELETE', headers: admin, body: '{}' })).status, 200);
    assert.equal((await fetch(base + `/conversations/${id}`, { headers: admin })).status, 404);
    const stopped = await fetch(base + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'stop' }) });
    const reader = stopped.body.getReader(); await reader.read(); await reader.cancel();
    for (let i = 0; i < 50 && !store.list().items.some(r => r.status === 'stopped'); i++) await new Promise(r => setTimeout(r, 20));
    assert.ok(store.list().items.some(r => r.status === 'stopped'));
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); rmSync(dir, { recursive: true, force: true }); }
});
