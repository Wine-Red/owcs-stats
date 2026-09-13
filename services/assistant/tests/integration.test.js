import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runChat, normalizeArgs, endsWithQueryPlan, providerOptionsFor, modelFor } from '../server/agent.js';
import { createSettings } from '../server/settings.js';
import { createApp } from '../server/app.js';
import { wikiPage, extractPage } from '../server/wiki.js';
import { createTools, clearDatasets } from '../server/tools.js';
import { turnSchema, requiresEvidence } from '../server/context.js';
import { renderAssistantMarkdown, streamAssistant } from '../../../src/services/assistantChat.mjs';

const ref = (id, name) => ({ id, name });
const bundle = () => ({ match: { id: 1, competition: ref(24, 'Cup'), date: '2026-08-23', stage: null,
  team1: { team: ref(1, 'A') }, team2: { team: ref(2, 'B') }, winner_team_id: 1 }, result_consistency: 'consistent',
  games: [{ game: { id: 11, map: { ...ref(9, 'Map'), mode: 'control' }, duration_seconds: 600,
    team1: { team: ref(1, 'A') }, team2: { team: ref(2, 'B') }, winner_team_id: 1, player_stats_coverage: { status: 'recorded' } },
    player_stats: [{ player: { ...ref(101, 'P1'), role: 'damage' }, team: ref(1, 'A'), metrics: { damage: 100, eliminations: 10, deaths: 2 } },
      { player: { ...ref(102, 'P2'), role: 'support' }, team: ref(2, 'B'), metrics: { damage: 200, eliminations: 20, deaths: null } }] }] });
const fakeClient = () => ({ baseUrl: 'https://example.test/data/v1', calls: [], async get(p) {
  this.calls.push(p); return { body: { data: p.endsWith('/data') ? bundle() : p === '/matches' ? [bundle().match] : bundle().match,
    pagination: { next_cursor: null } }, url: this.baseUrl + p, observedAt: new Date().toISOString() };
} });
const input = { text: '这场谁赢了？', history: [], page: { kind: 'match', match_id: 1, label: 'A vs B' } };

test('page scope, multi-metric analysis and cached follow-up preserve distinct filters', async () => {
  clearDatasets(); const client = fakeClient();
  const { tools } = createTools({ client, page: input.page });
  const analyze = args => tools.analyze_stats.execute({ scope_mode: 'page', scope: {}, metrics: ['damage'], group_by: ['player'], operation: 'sum', min_samples: 1, limit: 20, include_conflicts: false, ...args });
  const a = await analyze({ metrics: ['damage', 'eliminations'] });
  assert.equal(a.analyses.length, 2); assert.equal(a.analyses[0].rows[0].value, 200);
  const count = client.calls.length;
  const b = await analyze({ scope: { player_ids: [101] } });
  assert.equal(client.calls.length, count); assert.equal(b.analyses[0].rows[0].value, 100);
  const all = await analyze({}); assert.equal(all.analyses[0].rows.length, 2, 'filter cannot mutate cached dataset');
  const season = await analyze({ scope_mode: 'custom', scope: { competition_id: 24 } });
  assert.equal(season.scope.match_ids, undefined); assert.ok(client.calls.includes('/matches'));
  const invalid = await analyze({ group_by: ['hero'] }); assert.ok(invalid.error);
  const wins = await analyze({ metrics: ['map_win_rate'], scope: { team_ids: [1, 3] }, group_by: ['team'] });
  assert.deepEqual(wins.analyses[0].rows.map(r => r.dimensions.team.id), [1], 'opposing teams outside selection cannot enter comparison');
});

test('parameter repair never invents identity; page and message contracts remain bounded', () => {
  assert.deepEqual(normalizeArgs({ matchId: '42', metrics: 'damage', groupBy: 'player', scope: { player_ids: ['1', '2'] }, unused: null }),
    { match_id: 42, metrics: ['damage'], group_by: ['player'], scope: { player_ids: [1, 2] } });
  assert.deepEqual(normalizeArgs({}), {});
  assert.deepEqual(normalizeArgs({ player_id: '74', limit: 5 }, 'list_matches'), { filters: { player_id: 74 }, limit: 5 });
  assert.deepEqual(normalizeArgs({ player_id: 74, filters: { player_id: 54 } }, 'list_matches'), { player_id: 74, filters: { player_id: 54 } });
  assert.deepEqual(normalizeArgs({ metric: 'damage', scope: { team_ids: '2' } }), { metrics: ['damage'], scope: { team_ids: [2] } });
  assert.equal(turnSchema.parse(input).page.match_id, 1);
  assert.throws(() => turnSchema.parse({ ...input, history: Array(17).fill({ role: 'user', content: 'a' }) }));
  assert.throws(() => turnSchema.parse({ ...input, page: { match_id: 'wrong' } }));
});

test('unmatched local-language competition search provides directory candidates instead of a false absence', async () => {
  const calls = [];
  const client = { baseUrl: 'https://directory.test', async get(path, params) {
    calls.push(params);
    return { body: { data: params.q ? [] : [{ id: 24, name: 'Overwatch World Cup 2026' }], pagination: { next_cursor: null } },
      url: this.baseUrl + path, observedAt: new Date().toISOString() };
  } };
  const { tools } = createTools({ client, page: { kind: 'general' } });
  const result = await tools.lookup.execute({ kind: 'competitions', name: '守望世界杯' });
  assert.equal(calls.length, 2);
  assert.equal(result.candidates[0].id, 24);
  assert.match(result.note, /不能据此断言赛事不存在/);
});

test('multiple players use paginated filtered unions; shared matches count once and cache keys keep selections separate', async () => {
  clearDatasets();
  const calls = [];
  const data = id => { const b = bundle(); b.match.id = id; b.games[0].game.id = id * 10; return b; };
  const client = { baseUrl: 'https://union.test/data/v1', async get(p, params) {
    calls.push({ p, params });
    let body;
    if (p === '/matches') {
      assert.ok([101, 102].includes(params.player_id), 'must never enumerate unfiltered site matches');
      const ids = params.player_id === 101 ? (params.cursor ? [2] : [1]) : [1, 3];
      body = { data: ids.map(id => data(id).match), pagination: { next_cursor: params.player_id === 101 && !params.cursor ? 'next' : null } };
    } else body = { data: data(Number(p.split('/')[2])) };
    return { body, url: this.baseUrl + p, observedAt: new Date().toISOString() };
  } };
  const { tools } = createTools({ client, page: { kind: 'general' } });
  const args = { scope_mode: 'custom', scope: { player_ids: [101, 102] }, metrics: ['damage'], group_by: ['player'], operation: 'sum', limit: 10 };
  const result = await tools.analyze_stats.execute(args);
  assert.equal(result.analyses[0].coverage.matches, 3);
  assert.equal(result.analyses[0].rows[0].value, 600);
  assert.equal(calls.filter(c => c.p.endsWith('/data')).length, 3);
  const count = calls.length;
  await tools.analyze_stats.execute({ ...args, scope: { player_ids: [102, 101] } });
  assert.equal(calls.length, count, 'selection order does not change cache identity');
  const single = await tools.analyze_stats.execute({ ...args, scope: { player_ids: [101] } });
  assert.equal(single.analyses[0].coverage.matches, 2);
  assert.equal(single.analyses[0].rows[0].value, 200);
});

test('Liquipedia uses permitted page identities, sections and honest truncation', () => {
  assert.equal(wikiPage('https://liquipedia.net/overwatch/OWCS/2026#Format').page, 'OWCS/2026');
  for (const url of ['https://evil.test/overwatch/a', 'https://liquipedia.net/overwatch/api.php', 'https://liquipedia.net/overwatch/Special:Search']) assert.throws(() => wikiPage(url));
  const data = { parse: { title: 'Cup', revid: 1, sections: [{ index: '1', line: 'Format', anchor: 'Format' }], text: { '*': '<p>Overview</p><h2><span id="Format">Format</span></h2><p>Double elimination</p><script>bad()</script>' } } };
  const overview = extractPage(data, 'https://liquipedia.net/overwatch/Cup');
  assert.ok(overview.content.includes('Overview')); assert.ok(!overview.content.includes('Double elimination'));
  const format = extractPage(data, overview.source.url, '1');
  assert.ok(format.content.includes('Double elimination')); assert.ok(!format.content.includes('bad()'));
});

async function fakeModel(protocol, responses) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const text = responses(requests.length, body);
    if (protocol === 'openai') {
      const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
      if (text === 'tool') {
        chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'read_match', arguments: '{"matchId":"1"}' } }] });
        chunk({}, 'tool_calls');
      } else if (text === 'reasoning-only') {
        chunk({ role: 'assistant', reasoning_content: 'private-reasoning-marker' }); chunk({}, 'length');
      } else { chunk({ role: 'assistant', content: text }); await new Promise(r => setTimeout(r, 40)); chunk({}, 'stop'); }
      res.end('data: [DONE]\n\n');
    } else {
      const event = data => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
      event({ type: 'message_start', message: { id: 'msg-test', type: 'message', role: 'assistant', model: 'mock', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
      event({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
      event({ type: 'content_block_stop', index: 0 });
      event({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } });
      event({ type: 'message_stop' }); res.end();
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { requests, server, config: { protocol, model: 'mock', apiKey: 'test', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, maxTokens: 256 } };
}

test('real AI SDK streams OpenAI tokens and repairs malformed tool arguments before execution', async () => {
  const m = await fakeModel('openai', n => n === 1 ? 'tool' : 'A 队获胜。');
  try {
    const events = [], client = fakeClient();
    const result = await runChat({ config: m.config, input, client, emit: e => events.push(e) });
    assert.equal(result.text, 'A 队获胜。'); assert.equal(m.requests.length, 2);
    assert.ok(client.calls.includes('/matches/1/data')); assert.ok(!events.some(e => e.error));
    assert.ok(events.findIndex(e => e.type === 'text') < events.findIndex(e => e.type === 'done'));
    assert.ok(m.requests[1].messages.some(x => x.role === 'tool' && x.content.includes('consistent')));
    assert.equal(m.requests[0].stream, true);
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('real AI SDK accepts Anthropic event stream', async () => {
  const m = await fakeModel('anthropic', () => '你好，想聊哪场比赛？');
  try {
    const result = await runChat({ config: m.config, input: { ...input, text: '你好' }, client: fakeClient(), emit: () => {} });
    assert.match(result.text, /你好/); assert.equal(m.requests[0].stream, true);
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('official DeepSeek requests combine required tools with supported non-thinking mode', async () => {
  const m = await fakeModel('openai', n => n === 1 ? 'tool' : '已读取比赛结果。');
  try {
    const config = { ...m.config, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' };
    const { streamText } = await import('ai');
    await runChat({ config, input: { ...input, page: { kind: 'general' } }, client: fakeClient(), emit: () => {},
      stream: options => streamText({ ...options, model: modelFor(m.config) }) });
    assert.equal(m.requests[0].tool_choice, 'required');
    assert.deepEqual(m.requests[0].thinking, { type: 'disabled' });
    assert.deepEqual(m.requests[1].thinking, { type: 'disabled' });
    assert.equal(providerOptionsFor({ ...config, baseUrl: 'https://another-provider.test/v1' }), undefined);
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('a stop after announcing a query continues with original evidence instead of becoming a final answer', async () => {
  const m = await fakeModel('openai', n => n === 1 || n === 3 ? 'tool' : n === 2 ? '查到 Leave，我先看看他拿了哪些 MVP。' : '现有接口没有 MVP 获奖记录。你指的是哪一年的奖项？');
  try {
    const result = await runChat({ config: m.config, input, client: fakeClient(), emit: () => {} });
    assert.equal(m.requests.length, 4);
    assert.equal(result.metrics.plan_continuation, 1);
    assert.ok(m.requests[2].messages.some(x => x.role === 'tool' && x.content.includes('consistent')));
    assert.match(result.text, /哪一年的奖项/);
    assert.equal(endsWithQueryPlan('可以比较表现，但不能据此判断奖项不公。'), false);
    assert.equal(endsWithQueryPlan('你指的是哪次 MVP？'), false);
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('a model that keeps announcing plans is marked incomplete without unlimited retries', async () => {
  const m = await fakeModel('openai', () => '我先查一下比赛记录。');
  const events = [];
  try {
    await assert.rejects(runChat({ config: m.config, input, client: fakeClient(), emit: e => events.push(e) }), e => e.code === 'INCOMPLETE_ANSWER');
    assert.equal(m.requests.length, 2);
    assert.ok(!events.some(e => e.type === 'done'));
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('free questions require a successful tool before answering; model chooses the tool', async () => {
  const m = await fakeModel('openai', n => n === 1 ? 'tool' : '已查到 A 队获胜。');
  try {
    const result = await runChat({ config: m.config, input: { ...input, page: { kind: 'general' } }, client: fakeClient(), emit: () => {} });
    assert.equal(m.requests[0].tool_choice, 'required');
    assert.equal(m.requests[1].tool_choice, 'auto');
    assert.match(result.text, /A 队/);
    for (const text of ['你好', '谢谢！', '什么是每十分钟指标', 'KDA怎么算']) assert.equal(requiresEvidence(text), false);
    for (const text of ['Proper 和 Leave 谁厉害', '预测世界杯冠军', '你好，谁是冠军', '这个选手的每十分钟指标怎么样']) assert.equal(requiresEvidence(text), true);
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('unsupported direct claims and failed queries cannot bypass the evidence gate', async () => {
  for (const failTool of [false, true]) {
    const m = await fakeModel('openai', () => failTool ? 'tool' : '没有页面数据，无法比较。');
    const events = [];
    try {
      const client = failTool ? { baseUrl: 'https://failure.test', get: async () => { throw new Error('unavailable'); } } : fakeClient();
      await assert.rejects(runChat({ config: m.config, input: { ...input, page: { kind: 'general' } }, client, emit: e => events.push(e) }), e => e.code === 'EVIDENCE_REQUIRED');
      assert.ok(!events.some(e => e.type === 'text'));
      assert.ok(m.requests.slice(0, 6).every(r => r.tool_choice === 'required'));
    } finally { m.server.closeAllConnections(); m.server.close(); }
  }
});

test('Dots thinking setting reaches the wire, including recovery, without changing other models', async () => {
  const m = await fakeModel('openai', n => n === 1 ? '' : 'OK');
  try {
    await runChat({ config: { ...m.config, model: 'dots3-note-prev', dotsThinking: 'off' }, input, client: fakeClient(), emit: () => {} });
    assert.equal(m.requests.length, 2);
    for (const request of m.requests) assert.deepEqual(request.chat_template_kwargs, { enable_thinking: false });
    await runChat({ config: { ...m.config, dotsThinking: 'off' }, input, client: fakeClient(), emit: () => {} });
    assert.equal(m.requests[2].chat_template_kwargs, undefined);
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('final model step retains collected evidence and reserves a tool-free answer', async () => {
  const m = await fakeModel('openai', n => n <= 6 ? 'tool' : '已核对比赛，但这些证据不足以判断选手强弱。');
  try {
    const result = await runChat({ config: m.config, input, client: fakeClient(), emit: () => {} });
    assert.equal(m.requests.length, 7);
    assert.ok(!m.requests[6].tools?.length);
    assert.ok(m.requests[6].messages.some(x => x.role === 'tool' && x.content.includes('consistent')));
    assert.match(result.text, /证据不足/);
    assert.equal(result.metrics.finish_reason, 'stop');
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('an empty provider answer retains diagnostic finish reason rather than blaming query scope', async () => {
  const m = await fakeModel('openai', () => '');
  try {
    await assert.rejects(runChat({ config: m.config, input, client: fakeClient(), emit: () => {} }), error => {
      assert.equal(error.code, 'EMPTY_MODEL_RESPONSE');
      assert.equal(error.metrics.finish_reason, 'stop');
      assert.equal(error.metrics.model_steps, 2);
      assert.equal(error.metrics.empty_recovery, 1);
      assert.ok(!error.message.includes('缩小查询范围'));
      return true;
    });
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('empty final provider response recovers once without tools and preserves evidence', async () => {
  const m = await fakeModel('openai', n => n === 1 ? 'tool' : n === 2 ? '' : '已查到 A 队获胜，无法据此比较两名选手的整体实力。');
  try {
    const result = await runChat({ config: m.config, input, client: fakeClient(), emit: () => {} });
    assert.equal(m.requests.length, 3);
    assert.ok(!m.requests[2].tools?.length);
    assert.ok(m.requests[2].messages.some(x => x.role === 'tool' && x.content.includes('consistent')));
    assert.equal(result.metrics.empty_recovery, 1);
    assert.equal(result.metrics.initial_finish_reason, 'stop');
    assert.match(result.text, /无法据此/);
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('reasoning-only length response recovers without exposing reasoning as user text', async () => {
  const m = await fakeModel('openai', n => n === 1 ? 'reasoning-only' : '证据不足，暂时无法判断。');
  try {
    const events = [];
    const result = await runChat({ config: m.config, input, client: fakeClient(), emit: e => events.push(e) });
    assert.equal(m.requests.length, 2);
    assert.equal(result.metrics.initial_finish_reason, 'length');
    assert.ok(result.metrics.reasoning_chars > 0);
    assert.ok(!JSON.stringify(events).includes('private-reasoning-marker'));
    assert.equal(result.text, '证据不足，暂时无法判断。');
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('empty answer recovery has its own deadline and cannot loop or wait indefinitely', async () => {
  const m = await fakeModel('openai', () => '');
  try {
    await assert.rejects(runChat({ config: m.config, input, client: fakeClient(), emit: () => {}, recoveryTimeoutMs: 1 }), error => {
      assert.equal(error.code, 'EMPTY_MODEL_RESPONSE');
      assert.equal(error.metrics.recovery_timed_out, 1);
      assert.equal(error.metrics.empty_recovery, 1);
      assert.ok(m.requests.length <= 2);
      return true;
    });
  } finally { m.server.closeAllConnections(); m.server.close(); }
});

test('HTTP streams before completion, disconnect aborts; only encrypted configuration persists', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'owcs-assistant-')), settings = createSettings(dir);
  settings.save({ protocol: 'openai', baseUrl: 'https://example.test/v1/chat/completions', model: 'mock', apiKey: 'never-log-this-key' });
  assert.equal(settings.get().baseUrl, 'https://example.test/v1');
  assert.ok(!readFileSync(path.join(dir, 'settings.json'), 'utf8').includes('never-log-this-key'));
  let aborted = false;
  const app = createApp({ settings, client: fakeClient(), runner: async ({ signal, emit }) => {
    emit({ type: 'text', text: '首字' });
    await new Promise(resolve => { signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }); });
    return { metrics: {} };
  } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`, abort = new AbortController();
  try {
    assert.equal((await fetch(url + '/assistant/v1/settings')).status, 200);
    assert.equal((await fetch(url + '/assistant/v1/status', { headers: { origin: 'https://evil.test' } })).status, 403);
    const r = await fetch(url + '/assistant/v1/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: abort.signal });
    const first = await r.body.getReader().read(); assert.match(new TextDecoder().decode(first.value), /首字/);
    abort.abort(); await new Promise(r => setTimeout(r, 40)); assert.ok(aborted);
    assert.deepEqual(readdirSync(dir).sort(), ['key', 'settings.json']);
  } finally { server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('local management needs no second credential and preserves origin, JSON and secret boundaries', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'owcs-assistant-admin-')), settings = createSettings(dir);
  const config = { protocol: 'openai', baseUrl: 'https://example.test/v1', model: 'mock', apiKey: 'private-model-key' };
  let tests = 0;
  const app = createApp({ settings, client: fakeClient(), testConnection: async saved => {
    tests++; assert.equal(saved.apiKey, config.apiKey); return { text: 'OK', elapsed_ms: 1 };
  } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/assistant/v1`;
  const write = (endpoint, body, headers = {}) => fetch(url + endpoint, {
    method: endpoint === '/test' ? 'POST' : 'PUT',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:8080', ...headers }, body: JSON.stringify(body),
  });
  try {
    assert.deepEqual(await (await fetch(url + '/settings')).json(), {});
    assert.equal((await (await fetch(url + '/status')).json()).showInVisualize, true);
    assert.equal((await write('/settings/display', { showInVisualize: false })).status, 200);
    assert.equal(createSettings(dir).getDisplay().showInVisualize, false, 'display setting survives restarting before configuring a model');
    assert.equal(settings.get(), null);
    assert.equal((await write('/settings/display', { showInVisualize: 'false' })).status, 400);
    assert.equal((await write('/settings/display', { showInVisualize: true, apiKey: 'unrelated' })).status, 400);
    const saved = await write('/settings', config);
    assert.equal(saved.status, 200);
    const publicSettings = await saved.json(); assert.equal(publicSettings.apiKey, undefined); assert.equal(publicSettings.hasKey, true);
    assert.equal((await write('/settings', { ...config, model: 'next-model', apiKey: '' })).status, 200);
    assert.equal(settings.get(true).apiKey, config.apiKey);
    assert.equal((await (await fetch(url + '/status')).json()).showInVisualize, false, 'saving a model must not reset display choice');
    const encrypted = readFileSync(path.join(dir, 'settings.json'), 'utf8'), key = readFileSync(path.join(dir, 'key'));
    assert.equal((await write('/settings/display', { showInVisualize: true })).status, 200);
    assert.equal(readFileSync(path.join(dir, 'settings.json'), 'utf8'), encrypted);
    assert.deepEqual(readFileSync(path.join(dir, 'key')), key);
    assert.equal((await write('/test', {})).status, 200); assert.equal(tests, 1);
    for (const endpoint of ['/settings', '/test', '/settings/display']) {
      assert.equal((await write(endpoint, config, { origin: 'https://evil.test' })).status, 403);
      assert.equal((await write(endpoint, config, { 'sec-fetch-site': 'cross-site' })).status, 403);
      assert.equal((await write(endpoint, config, { 'content-type': 'text/plain' })).status, 415);
    }
    assert.equal((await fetch(url + '/settings', { headers: { origin: 'https://evil.test' } })).status, 403);
    // Node fetch normalizes Host to the URL; use HTTP for this boundary probe.
    const badHostStatus = await new Promise((resolve, reject) => {
      http.get(url + '/settings', { headers: { host: 'evil.test' } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(badHostStatus, 403);
    assert.equal(tests, 1); assert.equal(settings.get().model, 'next-model');
    assert.deepEqual(readdirSync(dir).sort(), ['display.json', 'key', 'settings.json']);
    assert.ok(!readFileSync(path.join(dir, 'settings.json'), 'utf8').includes(config.apiKey));
  } finally { server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('browser transport preserves split Unicode and rejects truncated streams; Markdown is inert', async () => {
  const bytes = new TextEncoder().encode('{"type":"text","text":"你好"}\n{"type":"done"}\n');
  const events = [];
  await streamAssistant({ text: 'hi', page: {}, history: [], onEvent: e => events.push(e), fetcher: async () => new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 27)); c.enqueue(bytes.slice(27)); c.close(); } }), { headers: { 'content-type': 'application/x-ndjson' } }) });
  assert.equal(events[0].text, '你好');
  await assert.rejects(streamAssistant({ text: 'hi', page: {}, history: [], onEvent: () => {}, fetcher: async () => new Response('{"type":"text","text":"partial"}', { headers: { 'content-type': 'application/x-ndjson' } }) }), /连接中断/);
  const html = renderAssistantMarkdown('<script>alert(1)</script> [bad](javascript:alert(1)) ![pixel](https://evil.test/a)');
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('href="javascript:')); assert.ok(!html.includes('<img'));
});
