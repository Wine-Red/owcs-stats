const express = require('express');
const crypto = require('node:crypto');
const { routes, isPublicConfigKey } = require('../services/siteApi/contract');

const defaultResolve = (controller, method) => {
  if (controller !== 'SiteController') return require(`../controllers/${controller}`)[method];
  if (method === 'meta') return async (_req, res) => res.json(await require('../services/siteApi/metadata').readMetadata());
  if (method === 'schedule') return async (_req, res) => res.json(await require('../services/UpcomingMatchesService').getUpcomingSchedule());
  return async (req, res) => {
    if (!isPublicConfigKey(req.params.key)) return res.status(404).json({ error: 'Not found' });
    const config = await require('../models/Config').findByPk(req.params.key);
    const value = config?.value || {};
    return res.json(req.params.key === 'latest_match_sync_updates' ? { lastSyncAt: value.lastSyncAt || null } : value);
  };
};

const createSiteRouter = ({ resolve = defaultResolve, now = Date.now, ttlMs = 15000,
  requestsPerMinute = 240, maxConcurrent = 12, maxBytes = 32 * 1024 * 1024 } = {}) => {
  const router = express.Router({ caseSensitive: true });
  const cache = new Map(), pending = new Map(), clients = new Map();
  let cachedBytes = 0, nextCleanup = 0;
  router.use((req, res, next) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'If-None-Match', 'Access-Control-Expose-Headers': 'ETag, Retry-After',
      'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'OPTIONS') return res.set('Access-Control-Max-Age', '600').status(204).end();
    if (!['GET', 'HEAD'].includes(req.method)) return res.set('Allow', 'GET, HEAD, OPTIONS').status(405).json({ error: 'Read-only API' });
    if (req.originalUrl.length > 4096) return res.status(400).json({ error: 'Request URL too long' });
    const time = now();
    if (time >= nextCleanup) {
      for (const [key, entry] of clients) if (entry.until <= time) clients.delete(key);
      nextCleanup = time + 60000;
    }
    const key = req.ip || req.socket.remoteAddress;
    let entry = clients.get(key);
    if (!entry || entry.until <= time) {
      if (!entry && clients.size >= 10000) return res.set('Retry-After', '60').status(429).json({ error: 'Too many requests' });
      entry = { count: 0, until: time + 60000 }; clients.set(key, entry);
    }
    if (++entry.count > requestsPerMinute) return res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - time) / 1000)))).status(429).json({ error: 'Too many requests' });
    next();
  });
  for (const [route, controller, method, allowed = []] of routes) {
    router.get(route, async (req, res, next) => {
      try {
        if (Object.entries(req.params).some(([key, value]) => key !== 'key' && !/^[1-9]\d{0,9}$/.test(value))) return res.status(400).json({ error: 'Invalid ID' });
        for (const [key, value] of Object.entries(req.query)) {
          if (!allowed.includes(key) || typeof value !== 'string') return res.status(400).json({ error: `Unsupported parameter: ${key}` });
          if (!['startDate', 'endDate'].includes(key) && (!/^[1-9]\d{0,9}$/.test(value) || (key === 'pageSize' && Number(value) > 10000))) return res.status(400).json({ error: `Invalid parameter: ${key}` });
          if (['startDate', 'endDate'].includes(key) && (!/^\d{4}-\d{2}-\d{2}(?:T[0-9:.+Z-]+)?$/.test(value) || !Number.isFinite(Date.parse(value)))) return res.status(400).json({ error: `Invalid date: ${key}` });
        }
        if (req.query.startDate || req.query.endDate) {
          const { timestampRange } = await import('../shared/dateRange.mjs');
          timestampRange(req.query);
        }
        if (controller === 'SiteController' && method === 'config' && !isPublicConfigKey(req.params.key)) return res.status(404).json({ error: 'Not found' });
        const key = `${req.path}?${new URLSearchParams(Object.entries(req.query).sort()).toString()}`;
        let result = cache.get(key);
        if (!result || result.until <= now()) {
          if (!pending.has(key)) {
            if (pending.size >= maxConcurrent) return res.set('Retry-After', '2').status(429).json({ error: 'API busy' });
            const task = (async () => {
              let status = 200, body;
              const output = { status(code) { status = code; return output; }, json(value) { body = value; return output; } };
              await resolve(controller, method)(req, output);
              if (body === undefined) throw new Error('Controller returned no JSON');
              if (status >= 500) body = { error: 'Data temporarily unavailable' };
              const bytes = Buffer.from(JSON.stringify(body));
              const record = { status, bytes, etag: `W/"${crypto.createHash('sha256').update(bytes).digest('hex')}"`, until: now() + ttlMs };
              if (status === 200 && bytes.length <= maxBytes) {
                if (cache.has(key)) { cachedBytes -= cache.get(key).bytes.length; cache.delete(key); }
                while (cache.size >= 256 || cachedBytes + bytes.length > maxBytes) {
                  const oldest = cache.keys().next().value; cachedBytes -= cache.get(oldest).bytes.length; cache.delete(oldest);
                }
                cache.set(key, record); cachedBytes += bytes.length;
              }
              return record;
            })();
            pending.set(key, task);
            task.finally(() => pending.delete(key)).catch(() => {});
          }
          result = await pending.get(key);
        }
        if (result.status === 200) {
          res.set('Cache-Control', 'public, max-age=0, must-revalidate').set('ETag', result.etag);
          const condition = req.get('If-None-Match');
          if (condition && (condition.trim() === '*' || condition.split(',').some(item => item.trim().replace(/^W\//, '') === result.etag.slice(2)))) return res.status(304).end();
        }
        res.status(result.status).type('json').send(result.bytes);
      } catch (error) { next(error); }
    });
  }
  router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  router.use((error, _req, res, _next) => { // eslint-disable-line no-unused-vars
    const invalid = error instanceof URIError || error.statusCode === 400;
    res.status(invalid ? 400 : 503).json({ error: invalid ? 'Invalid request' : 'Data temporarily unavailable' });
  });
  return router;
};
module.exports = { createSiteRouter };
