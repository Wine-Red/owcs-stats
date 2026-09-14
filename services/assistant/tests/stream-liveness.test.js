import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp, publicError } from '../server/app.js';
import { streamAssistant } from '../../../src/services/assistantChat.mjs';

test('silent upstream receives heartbeats and even an abort-insensitive runner ends at the deadline', async () => {
  const app = createApp({ heartbeatMs: 20, requestTimeoutMs: 160,
    settings: { get: () => ({ model: 'fake' }), getDisplay: () => ({}) }, client: {},
    runner: () => new Promise(() => {}) });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base + '/assistant/v1/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '你好' }), signal: AbortSignal.timeout(3000) });
    const reader = response.body.getReader(); const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /heartbeat/);
    let text = new TextDecoder().decode(first.value);
    while (true) { const next = await reader.read(); if (next.done) break; text += new TextDecoder().decode(next.value); }
    const events = text.trim().split('\n').map(JSON.parse);
    assert.ok(events.filter(e => e.type === 'heartbeat').length >= 2);
    assert.equal(events.at(-1).type, 'error');
    assert.match(events.at(-1).text, /超时/);
    assert.equal((await (await fetch(base + '/health')).json()).active, 0);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});

test('browser translates broken streams and unavailable models into actionable errors', async () => {
  const fetcher = async () => new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('network error')); } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
  await assert.rejects(streamAssistant({ text: '你好', history: [], page: {}, onEvent() {}, fetcher }), /连接中断/);
  assert.match(publicError({ statusCode: 503 }), /暂时不可用/);
});
