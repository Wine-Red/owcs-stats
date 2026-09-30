const express = require('express');
const { createHash } = require('crypto');
const service = require('../services/MatchPollService');
const settings = require('../services/MatchPollSettingsService');

const createPollRouter = (pollService = service, pollSettings = settings) => {
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
      const allowed = [process.env.POLL_ALLOWED_ORIGINS || 'https://stats.owmini.xyz', process.env.POLL_PARTNER_ORIGINS || ''].join(',').split(',').map(s => s.trim()).filter(Boolean);
      const local = process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
      const openPartner = allowed.includes('*') && (() => { try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && url.origin === origin; } catch { return false; } })();
      if (origin && !allowed.includes(origin) && !local && !openPartner) return res.status(403).json({ error: '当前页面暂不支持投票' });
      const session = req.path === '/visitor';
      if (!limit(`${session ? 'identity' : 'vote'}:${ip}`, session ? 60 : 120, session ? 3600000 : 60000)) {
        return res.status(429).json({ error: '操作较频繁，请稍后再试' });
      }
      if (!session && !limit(`visitor:${req.get('X-Vote-Token') || ''}`, 20, 60000)) return res.status(429).json({ error: '操作较频繁，请稍后再试' });
    }
    next();
  });
  router.get('/status', async (_req, res) => res.json(await pollSettings.getStatus()));
  router.get('/summary', async (req, res) => {
    const summary = await pollService.getSummary(req.query.seasonId, req.get('X-Vote-Token'));
    const { enabled } = await pollSettings.getStatus();
    const closePolls = entries => Object.fromEntries(Object.entries(entries || {}).map(([id, poll]) => [id, { ...poll, closed: true }]));
    res.json({ ...summary, enabled, ...(!enabled ? { sources: closePolls(summary.sources), matches: closePolls(summary.matches) } : {}) });
  });
  router.get('/upcoming', async (_req, res) => res.json(await require('../services/UpcomingMatchesService').getUpcomingMatches()));
  // Settings writes stay on the existing authenticated /api/config boundary.
  // Check both public writes so a page opened before disabling cannot keep voting.
  router.use(['/visitor', '/vote'], async (req, res, next) => {
    if (req.method !== 'POST') return next();
    if (!(await pollSettings.getStatus()).enabled) {
      return res.status(403).json({ error: '投票功能已关闭', code: 'VOTING_DISABLED' });
    }
    next();
  });
  router.post('/visitor', async (_req, res) => res.json({ token: await pollService.createVisitor() }));
  router.post('/vote', async (req, res) => res.json(await pollService.castVote(req.body, req.get('X-Vote-Token'))));
  return router;
};
module.exports = { createPollRouter };
