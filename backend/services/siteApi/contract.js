// Explicit public presentation surface. Reuse controllers; never mount the admin router.
const catalog = ['Season', 'Team', 'Player', 'Map', 'Hero'];
const routes = catalog.flatMap(name => {
  const resource = name === 'Hero' ? 'heroes' : `${name.toLowerCase()}s`;
  return [[`/${resource}`, `${name}Controller`, 'getAll'], [`/${resource}/:id`, `${name}Controller`, 'getById']];
});
routes.push(
  ['/matches/upcoming', 'SiteController', 'schedule'],
  ['/matches', 'MatchController', 'getAll', ['page', 'pageSize', 'seasonId', 'teamId', 'mapId', 'startDate', 'endDate']],
  ['/matches/:id', 'MatchController', 'getById'],
  ['/matches/:id/data', 'MatchController', 'getData'],
  ['/matches/:id/map-games', 'MatchController', 'getMapGames'],
  ['/map-games', 'MapGameController', 'getAll', ['page', 'pageSize', 'seasonId', 'mapId', 'teamId', 'startDate', 'endDate']],
  ['/map-games/:id', 'MapGameController', 'getById'],
  ['/map-games/:id/player-stats', 'MapGameController', 'getPlayerStats'],
  ['/season-teams', 'SeasonTeamController', 'getAll'],
  ['/seasons/:seasonId/teams', 'SeasonTeamController', 'getTeamsBySeasonId'],
  ['/season-teams/:seasonTeamId/players', 'SeasonTeamPlayerController', 'getPlayersBySeasonTeamId'],
  ['/season-team-players', 'SeasonTeamPlayerController', 'getAll'],
  ['/stats/player/:playerId/profile', 'StatsController', 'getPlayerProfile', ['seasonId']],
  ['/stats/hero/overview', 'StatsController', 'getHeroOverview', ['seasonId']],
  ['/stats/hero/players', 'StatsController', 'getHeroPlayers', ['seasonId', 'heroId']],
  ['/stats/player/heroes', 'StatsController', 'getPlayerHeroes', ['seasonId', 'playerId']],
  ['/season-stats/:seasonId', 'SeasonStatController', 'getSeasonStats', ['stageId']],
  ['/season-stats/:seasonId/team-score', 'SeasonStatController', 'getSeasonTeamScoreStats', ['stageId']],
  ['/season-stats/:seasonId/map-picks', 'SeasonStatController', 'getSeasonMapPickStats', ['stageId']],
  ['/season-stats/:seasonId/teams/:teamId/compositions', 'SeasonStatController', 'getSeasonTeamCompositions', ['stageId']],
  ['/season-stats/:seasonId/teams/:teamId/hero-stats', 'SeasonStatController', 'getSeasonTeamHeroStats', ['stageId']],
  ['/season-stats/:seasonId/features', 'SeasonStatController', 'getSeasonFeatures'],
  ['/season-stats/:seasonId/stages', 'SeasonStageController', 'list'],
  ['/config/:key', 'SiteController', 'config'],
  ['/meta', 'SiteController', 'meta']
);
const isPublicConfigKey = key => /^(?:visualize_chart_config|visualize_stage_season_order|visualize_season_[1-9]\d*|latest_match_sync_updates)$/.test(key);
module.exports = { routes, isPublicConfigKey };
