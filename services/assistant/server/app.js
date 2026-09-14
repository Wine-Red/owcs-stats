import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { turnSchema } from './context.js';
import { runChat, checkConnection } from './agent.js';

export function createApp({ settings, conversations, client, wiki, runner = runChat, testConnection = checkConnection,
  production = false, publicOrigin = 'https://stats.owmini.xyz', partnerOrigins = [], heartbeatMs = 10000, requestTimeoutMs = 180000,
  allowedOrigins = production ? [publicOrigin] : ['http://127.0.0.1:8080', 'http://localhost:8080', 'http://127.0.0.1:4330', 'http://localhost:4330'] }) {
  const app = express();
  if (production) app.set('trust proxy', 'loopback');
  const active = new Set(), rates = new Map();
  app.use(helmet());
  app.use((req, res, next) => {
    // Production stays loopback-only, behind the site's authenticated gateway.
    if (production && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress))
      return res.status(403).json({ error: '请通过站点网关访问' });
    const host = req.hostname;
    const hosts = production ? [new URL(publicOrigin).hostname, 'localhost', '127.0.0.1'] : ['localhost', '127.0.0.1'];
    if (!hosts.includes(host)) return res.status(403).json({ error: '请求域名不允许' });
    const origin = req.get('origin');
    const publicPath = req.path === '/assistant/v1/status' || req.path === '/assistant/v1/chat';
    const webOrigin = (() => { try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && url.origin === origin; } catch { return false; } })();
    const openPartners = partnerOrigins.includes('*');
    const partner = production && webOrigin && (openPartners || partnerOrigins.includes(origin)) && publicPath;
    if ((origin && !allowedOrigins.includes(origin) && !partner) || (req.get('sec-fetch-site') === 'cross-site' && !partner))
      return res.status(403).json({ error: '请求来源不允许' });
    res.set('Cache-Control', 'no-store');
    if (partner) {
      res.vary('Origin');
      res.set('Access-Control-Allow-Origin', openPartners ? '*' : origin);
      if (req.method === 'OPTIONS') {
        const method = req.get('Access-Control-Request-Method');
        const headers = (req.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
        const methods = req.path.endsWith('/chat') ? ['POST'] : ['GET', 'HEAD'];
        if (!methods.includes(method) || headers.some(v => v !== 'content-type')) return res.sendStatus(403);
        res.set({ 'Access-Control-Allow-Methods': methods.join(', '), 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '300' });
        return res.sendStatus(204);
      }
    }
    next();
  });
  app.use(express.json({ limit: '128kb' }));
  const base = '/assistant/v1';
  if (production) app.use(base, (req, res, next) => {
    const publicRequest = (req.path === '/status' && ['GET', 'HEAD'].includes(req.method))
      || (req.path === '/chat' && req.method === 'POST');
    if (!publicRequest && !req.get('Remote-User')?.trim()) return res.status(401).json({ error: '请先登录管理后台' });
    next();
  });
  // Management uses the site's login gateway, not a second browser credential.
  // Keep this service loopback-only and these routes behind the protected gateway.
  function adminWrite(req, res, next) {
    if (!req.is('application/json')) return res.status(415).json({ error: '管理请求必须使用 JSON 格式' });
    next();
  }
  function rate(req, res, next) {
    const now = Date.now(), key = production ? req.ip : req.socket.remoteAddress;
    for (const [k, r] of rates) if (r.until < now) rates.delete(k);
    const r = rates.get(key) || { count: 0, until: now + 60000 }; rates.set(key, r);
    if (++r.count > 40) return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    next();
  }
  app.get('/health', (_req, res) => res.json({ ok: true, active: active.size }));
  app.get(`${base}/status`, (_req, res) => res.json({ configured: !!settings.get(), dataSource: client.baseUrl, ...settings.getDisplay() }));
  app.put(`${base}/settings/display`, rate, adminWrite, (req, res) => res.json(settings.saveDisplay(req.body)));
  app.get(`${base}/settings`, (_req, res) => res.json(settings.get() || {}));
  app.get(`${base}/conversations`, (req, res) => {
    if (!conversations) return res.status(503).json({ error: '对话记录未启用' });
    const offset = Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return res.status(400).json({ error: '分页参数不正确' });
    res.json(conversations.list(offset));
  });
  app.get(`${base}/conversations/:id`, (req, res) => {
    if (!conversations) return res.status(503).json({ error: '对话记录未启用' });
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(400).json({ error: '记录编号不正确' });
    const record = conversations.get(req.params.id);
    if (!record) return res.status(404).json({ error: '记录不存在或已过期' });
    res.json(record);
  });
  app.delete(`${base}/conversations/:id`, rate, adminWrite, (req, res) => {
    if (!conversations) return res.status(503).json({ error: '对话记录未启用' });
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(400).json({ error: '记录编号不正确' });
    conversations.remove(req.params.id); res.json({ ok: true });
  });
  app.put(`${base}/settings`, rate, adminWrite, (req, res) => res.json(settings.save(req.body)));
  app.post(`${base}/test`, rate, adminWrite, async (_req, res) => {
    const config = settings.get(true);
    if (!config) return res.status(409).json({ error: '请先保存模型配置' });
    try { res.json(await testConnection(config)); }
    catch (e) { res.status(502).json({ error: publicError(e) }); }
  });
  app.post(`${base}/chat`, rate, async (req, res) => {
    const input = turnSchema.parse(req.body), config = settings.get(true);
    if (!config) return res.status(409).json({ error: '助手尚未配置模型，请联系管理员' });
    if (active.size >= 3) return res.status(429).json({ error: '助手正在处理其他问题，请稍后再试' });
    const startedAt = new Date().toISOString();
    let answer = '', outcome = 'completed', metrics = {}, errorCode;
    const controller = new AbortController(); active.add(controller);
    const timer = setTimeout(() => controller.abort(new Error('本次查询超时')), requestTimeoutMs);
    res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.on('close', () => { if (!res.writableEnded) controller.abort(new Error('客户端已断开')); });
    const emit = event => {
      if (event.type === 'text') answer = (answer + event.text).slice(0, 100000);
      if (!res.destroyed) res.write(JSON.stringify(event) + '\n');
    };
    // Send actual bytes immediately and while the model is silent. Headers alone
    // do not keep intermediary streaming connections alive.
    emit({ type: 'heartbeat' });
    const heartbeat = setInterval(() => emit({ type: 'heartbeat' }), heartbeatMs);
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      // Some upstream SDK waits may not settle promptly after abort. Always
      // terminate the HTTP stream with a structured error at our own deadline.
      const result = await Promise.race([runner({ config, input, client, wiki, signal: controller.signal, emit }), aborted]);
      metrics = result.metrics || {};
      // Timings only: no transcript, user IDs, model secrets or tool arguments.
      console.log(JSON.stringify({ event: 'assistant_completed', ...result.metrics }));
    } catch (e) {
      outcome = controller.signal.aborted ? 'stopped' : 'failed';
      errorCode = e.code || 'REQUEST_FAILED'; metrics = e.metrics || {};
      console.warn(JSON.stringify({ event: 'assistant_failed', code: e.code || 'REQUEST_FAILED',
        aborted: controller.signal.aborted, ...(e.metrics || {}) }));
      emit({ type: 'error', text: controller.signal.aborted ? '回答已停止或查询超时，可以重试。' : publicError(e) });
    } finally {
      clearTimeout(timer); clearInterval(heartbeat); controller.signal.removeEventListener('abort', onAbort); active.delete(controller);
      metrics.total_ms ??= Date.now() - Date.parse(startedAt);
      if (controller.signal.aborted) outcome = 'stopped';
      try { conversations?.save({ ...input, answer, status: outcome, errorCode, metrics,
        startedAt, model: config.model, origin: req.get('origin') || null }); }
      catch { console.warn(JSON.stringify({ event: 'assistant_record_failed' })); }
      res.end();
    }
  });
  const directory = fileURLToPath(new URL('../public/', import.meta.url));
  app.get(`${base}/admin`, (_req, res) => res.sendFile(path.join(directory, 'admin.html')));
  app.get(`${base}/admin.js`, (_req, res) => res.sendFile(path.join(directory, 'admin.js')));
  app.use((_req, res) => res.status(404).json({ error: '接口不存在' }));
  app.use((error, _req, res, _next) => {
    const fields = error.issues?.map(i => `${i.path.join('.')}: ${i.message}`);
    res.status(fields || error.type === 'entity.too.large' ? 400 : 500).json({ error: fields?.join('；') || '请求无法处理，请检查输入长度和格式' });
  });
  return app;
}

export function publicError(error) {
  if (['EMPTY_MODEL_RESPONSE', 'EVIDENCE_REQUIRED', 'INCOMPLETE_ANSWER'].includes(error.code)) return error.message;
  if (error.statusCode === 429 || error.statusCode >= 500) return '模型服务当前繁忙或暂时不可用，请稍后重试。';
  if (error.statusCode) return `模型服务返回 ${error.statusCode}，请检查服务地址、协议和模型权限。`;
  if (/API|fetch|connect|timeout|abort/i.test(error.name || '')) return '模型服务连接失败或超时，请重试；可在管理页测试连接。';
  if (/本次未生成/.test(error.message || '')) return error.message;
  return '本次回答未完成，请重试；若持续发生，请在管理页检查模型的工具调用支持。';
}
