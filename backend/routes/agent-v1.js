const express = require('express');
const { AgentApiController } = require('../controllers/AgentApiController');
const {
  agentApiErrorHandler,
  agentRequestContext,
  asyncAgentHandler
} = require('../middleware/agentApi');

const router = express.Router();
const get = (path, handler) => router.get(path, asyncAgentHandler(handler));

router.use(agentRequestContext);
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return res.status(405).json({
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Agent API is read-only'
    }
  });
});

get('/meta', AgentApiController.meta);
get('/seasons', AgentApiController.seasons);
get('/seasons/:seasonId/stages', AgentApiController.stages);
get('/teams', AgentApiController.teams);
get('/players', AgentApiController.players);
get('/rosters', AgentApiController.rosters);
get('/catalog/maps', AgentApiController.maps);
get('/catalog/heroes', AgentApiController.heroes);
get('/matches', AgentApiController.matches);
get('/matches/:matchId', AgentApiController.match);
get('/matches/:matchId/coverage', AgentApiController.matchCoverage);
get('/matches/:matchId/map-games', AgentApiController.mapGames);
get('/matches/:matchId/map-games/:mapGameId', AgentApiController.mapGame);
get('/matches/:matchId/map-games/:mapGameId/player-stats', AgentApiController.playerStats);
get('/matches/:matchId/map-games/:mapGameId/player-stats/:playerStatId/hero-stats', AgentApiController.playerHeroStats);
get('/upcoming-matches', AgentApiController.upcomingMatches);
get('/coverage/seasons/:seasonId', AgentApiController.seasonCoverage);

router.use((req, res) => res.status(404).json({
  error: {
    code: 'NOT_FOUND',
    message: 'Agent API endpoint not found'
  }
}));
router.use(agentApiErrorHandler);

module.exports = router;
