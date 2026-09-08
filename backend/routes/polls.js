const express = require('express');
const { createHash } = require('crypto');
const service = require('../services/MatchPollService');

const createPollRouter = (pollService = service) => {
  const router = express.Router();
  const limits = new Map();
  const limit = (key, max, duration) => {
    const now = Date.now();
    for (const [k, entry] of limits) if (entry.until <= now) limits.delete(k);
    const entry = limits.get(key) || { count: 0, until: now + duration };
    if (limits.size > 20000 && !limits.has(key)) return false;
    entry.count++; limits.set(key, entry);
    return entry.count <= max;
  };
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    const ip = createHash('sha256').update(req.ip || 'unknown').digest('hex');
    if (!limit(`all:${ip}`, 300, 60000)) return res.status(429).json({ error: '请求较多，请稍后重试' });
    if (req.method !== 'GET') {
      const origin = req.get('Origin');
      const allowed = (process.env.POLL_ALLOWED_ORIGINS || 'https://stats.owmini.xyz').split(',').map(s => s.trim());
      const local = process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
      if (origin && !allowed.includes(origin) && !local) return res.status(403).json({ error: '当前页面暂不支持投票' });
      const session = req.path === '/visitor';
      if (!limit(`${session ? 'identity' : 'vote'}:${ip}`, session ? 60 : 120, session ? 3600000 : 60000)) {
        return res.status(429).json({ error: '操作较频繁，请稍后再试' });
      }
      if (!session && !limit(`visitor:${req.get('X-Vote-Token') || ''}`, 20, 60000)) return res.status(429).json({ error: '操作较频繁，请稍后再试' });
    }
    next();
  });
  router.get('/summary', async (req, res) => res.json(await pollService.getSummary(req.query.seasonId, req.get('X-Vote-Token'))));
  router.get('/upcoming', async (_req, res) => res.json(await require('../services/UpcomingMatchesService').getUpcomingMatches()));
  router.post('/visitor', async (_req, res) => res.json({ token: await pollService.createVisitor() }));
  router.post('/vote', async (req, res) => res.json(await pollService.castVote(req.body, req.get('X-Vote-Token'))));
  return router;
};
module.exports = { createPollRouter };
