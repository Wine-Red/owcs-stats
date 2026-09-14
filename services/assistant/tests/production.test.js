import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';

test('production requires gateway login for management and isolates rate limits by forwarded visitor', async () => {
  const app = createApp({ production: true,
    settings: { get: () => null, getDisplay: () => ({ showInVisualize: true }) },
    client: { baseUrl: 'https://stats.owmini.xyz/data/v1' } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/assistant/v1`;
  const headers = { origin: 'https://stats.owmini.xyz', 'x-forwarded-host': 'stats.owmini.xyz', 'x-forwarded-for': '198.51.100.10' };
  const request = (path, extra = {}) => fetch(base + path, { ...extra, headers: { ...headers, ...extra.headers } });
  try {
    const status = await request('/status'); assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { configured: false, dataSource: 'https://stats.owmini.xyz/data/v1', showInVisualize: true });
    for (const [path, method] of [['/settings', 'GET'], ['/settings', 'PUT'], ['/settings/display', 'PUT'], ['/test', 'POST'], ['/admin', 'GET'], ['/admin.js', 'GET']]) {
      assert.equal((await request(path, { method })).status, 401, path);
    }
    assert.equal((await request('/settings', { headers: { 'remote-user': 'admin' } })).status, 200);
    assert.equal((await request('/status', { headers: { origin: 'https://evil.test' } })).status, 403);
    assert.equal((await request('/status', { headers: { 'x-forwarded-host': 'evil.test' } })).status, 403);
    const chat = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '介绍比赛', page: { kind: 'general', label: '自由问答' }, history: [] }) };
    for (let i = 0; i < 40; i++) assert.equal((await request('/chat', chat)).status, 409);
    assert.equal((await request('/chat', chat)).status, 429);
    assert.equal((await request('/chat', { ...chat, headers: { ...chat.headers, 'x-forwarded-for': '198.51.100.11' } })).status, 409);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
