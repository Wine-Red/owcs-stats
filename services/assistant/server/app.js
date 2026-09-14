import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { turnSchema } from './context.js';
import { runChat, checkConnection } from './agent.js';

export function createApp({ settings, client, wiki, runner = runChat, testConnection = checkConnection,
  production = false, publicOrigin = 'https://stats.owmini.xyz',
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
    if ((origin && !allowedOrigins.includes(origin)) || req.get('sec-fetch-site') === 'cross-site')
      return res.status(403).json({ error: '请求来源不允许' });
    res.set('Cache-Control', 'no-store');
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
    const controller = new AbortController(); active.add(controller);
    const timer = setTimeout(() => controller.abort(new Error('本次查询超时')), 180000);
    res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.on('close', () => { if (!res.writableEnded) controller.abort(new Error('客户端已断开')); });
    const emit = event => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n'); };
    try {
      const result = await runner({ config, input, client, wiki, signal: controller.signal, emit });
      // Timings only: no transcript, user IDs, model secrets or tool arguments.
      console.log(JSON.stringify({ event: 'assistant_completed', ...result.metrics }));
    } catch (e) {
      console.warn(JSON.stringify({ event: 'assistant_failed', code: e.code || 'REQUEST_FAILED',
        aborted: controller.signal.aborted, ...(e.metrics || {}) }));
      emit({ type: 'error', text: controller.signal.aborted ? '回答已停止或查询超时，可以重试。' : publicError(e) });
    } finally { clearTimeout(timer); active.delete(controller); res.end(); }
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
  if (error.statusCode) return `模型服务返回 ${error.statusCode}，请检查服务地址、协议和模型权限。`;
  if (/API|fetch|connect|timeout|abort/i.test(error.name || '')) return '模型服务连接失败或超时，请重试；可在管理页测试连接。';
  if (/本次未生成/.test(error.message || '')) return error.message;
  return '本次回答未完成，请重试；若持续发生，请在管理页检查模型的工具调用支持。';
}
