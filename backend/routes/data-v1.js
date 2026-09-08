const express = require('express');
const crypto = require('node:crypto');
const { createPublicDataService } = require('../services/publicData/service');
const { parseParameters } = require('../services/publicData/parameters');
const { PublicDataError, invalid, notFound } = require('../services/publicData/errors');

const createDataRouter = ({ service = createPublicDataService(), requestsPerMinute = 240, maxConcurrent = 24,
  now = Date.now, logError = console.error } = {}) => {
  const router = express.Router({ strict: true, caseSensitive: true });
  const clients = new Map();
  let active = 0, nextCleanup = 0;
  router.use((req, res, next) => {
    res.set('X-Request-Id', crypto.randomUUID());
    res.set('Cache-Control', 'no-store');
    // Express application mounts are otherwise case-insensitive by default.
    if (req.baseUrl !== '/data/v1') return next(notFound());
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.set('Allow', 'GET, HEAD');
      return next(new PublicDataError(405, 'METHOD_NOT_ALLOWED', 'Only GET and HEAD are supported.'));
    }
    if (req.originalUrl.length > 8192) return next(invalid('Request URL is too long.'));
    const time = now();
    if (time >= nextCleanup) {
      for (const [key, entry] of clients) if (entry.until <= time) clients.delete(key);
      nextCleanup = time + 60000;
    }
    const key = req.ip || req.socket.remoteAddress;
    let entry = clients.get(key);
    if (entry?.until <= time) { clients.delete(key); entry = undefined; }
    if (!entry && clients.size < 10000) { entry = { count: 0, until: time + 60000 }; clients.set(key, entry); }
    if (!entry || ++entry.count > requestsPerMinute || active >= maxConcurrent) {
      res.set('Retry-After', String(active >= maxConcurrent ? 1 : Math.max(1, Math.ceil(((entry?.until || nextCleanup) - time) / 1000))));
      return next(new PublicDataError(429, 'RATE_LIMITED', 'Too many requests; retry after the indicated delay.'));
    }
    active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once('finish', release);
    res.once('close', release);
    next();
  });

  const get = (path, allowed, paginated, handler) => router.get(path, async (req, res, next) => {
    try {
      const context = parseParameters(req, allowed, paginated);
      const body = Buffer.from(JSON.stringify(await handler(context)));
      res.set('Cache-Control', 'public, max-age=0, must-revalidate');
      const etag = `W/"${crypto.createHash('sha256').update(body).digest('hex')}"`;
      res.set('ETag', etag);
      // The representation has just been read from its source, satisfying even
      // Cache-Control: no-cache. Weak comparison is required for If-None-Match.
      const condition = req.get('If-None-Match');
      if (condition && (condition.trim() === '*' || condition.split(',').some(value => value.trim().replace(/^W\//, '') === etag.slice(2)))) {
        return res.status(304).end();
      }
      res.type('application/json').set('Content-Length', String(body.length));
      return res.status(200).end(req.method === 'HEAD' ? undefined : body);
    } catch (error) { return next(error); }
  });
  for (const [kind, idName, filters] of [
    ['competitions', 'competition_id', ['q', 'status']], ['teams', 'team_id', ['q']],
    ['players', 'player_id', ['q', 'competition_id', 'team_id', 'role']],
    ['maps', 'map_id', ['q', 'mode']], ['heroes', 'hero_id', ['q', 'role']]
  ]) {
    get(`/${kind}`, filters, true, context => service.catalog(kind, context));
    get(`/${kind}/:${idName}`, [], false, ({ params }) => service.item(kind, params[idName]));
  }
  get('/competitions/:competition_id/stages', [], false, ({ params }) => service.stages(params.competition_id));
  get('/competitions/:competition_id/teams', ['q'], true, context => service.catalog('teams', context));
  get('/competitions/:competition_id/teams/:team_id/players', [], false, ({ params }) => service.roster(params.competition_id, params.team_id));
  get('/competitions/:competition_id/coverage', ['stage_id'], false, ({ params, query }) => service.coverage(params.competition_id, query));
  get('/matches', ['competition_id', 'stage_id', 'team_id', 'opponent_id', 'player_id', 'map_id', 'date_from', 'date_to'], true, ({ query }) => service.matches(query));
  get('/matches/:match_id', [], false, ({ params }) => service.match(params.match_id));
  get('/matches/:match_id/data', [], false, context => service.gameResource('data', context));
  get('/matches/:match_id/games', [], false, context => service.gameResource('games', context));
  get('/matches/:match_id/games/:game_id', [], false, context => service.gameResource('game', context));
  get('/matches/:match_id/games/:game_id/player-stats', ['team_id', 'player_id'], false, context => service.gameResource('stats', context));
  get('/schedule', [], false, () => service.schedule());
  router.use((_req, _res, next) => next(notFound()));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof URIError) error = invalid('Invalid path encoding.');
    const known = error instanceof PublicDataError;
    const status = known ? error.status : 500;
    if (status >= 500) logError(`[data-api] ${res.get('X-Request-Id')}`, error.internalReason || error.message);
    const body = Buffer.from(JSON.stringify({ error: {
      code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'The request could not be completed.'
    } }));
    res.set('Cache-Control', 'no-store').removeHeader('ETag');
    res.type('application/json').set('Content-Length', String(body.length));
    res.status(status).end(req.method === 'HEAD' ? undefined : body);
  });
  return router;
};

module.exports = { createDataRouter };
