const Season = require('../models/Season');
const Team = require('../models/Team');
const Player = require('../models/Player');
const MapModel = require('../models/Map');
const Hero = require('../models/Hero');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const RosterReadService = require('./RosterReadService');
const Config = require('../models/Config');
const SeasonStatsCalculator = require('./SeasonStatsCalculator');
const PublicStatsService = require('./PublicStatsService');
const SeasonStageService = require('./SeasonStageService');
const SeasonStage = require('../models/SeasonStage');
const MapGameTimeline = require('../models/MapGameTimeline');
const sequelize = require('../config/database');
const { Transaction } = require('sequelize');
const { getUpcomingSchedule } = require('./UpcomingMatchesService');
const { buildMatchDataDetail } = require('./MatchDataDetailService');

const plain = model => model?.get ? model.get({ plain: true }) : model;

const withoutKeys = (value, keys) => {
  const result = { ...value };
  keys.forEach(key => delete result[key]);
  return result;
};

const pushGrouped = (map, key, value) => {
  const normalizedKey = String(key);
  if (!map.has(normalizedKey)) map.set(normalizedKey, []);
  map.get(normalizedKey).push(value);
};

const buildStaticExportSnapshot = async ({ schedule: suppliedSchedule } = {}) => {
  // Observe the external schedule before taking the database snapshot.
  const schedule = suppliedSchedule || await getUpcomingSchedule();
  if (!Array.isArray(schedule.data) || !Number.isFinite(schedule.observedAt)) throw new Error('Invalid schedule snapshot');
  const [
    seasonModels,
    teamModels,
    playerModels,
    mapModels,
    heroModels,
    seasonTeamModels,
    seasonTeamPlayerModels,
    configModels,
    matchModels,
    mapGameModels,
    playerStatModels,
    playerHeroStatModels,
    timelineModels,
    stageModels
  ] = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async transaction => Promise.all([
    Season.findAll({ transaction }),
    Team.findAll({ transaction }),
    Player.findAll({ transaction }),
    MapModel.findAll({ transaction }),
    Hero.findAll({ transaction }),
    RosterReadService.getSeasonTeams({ transaction }),
    RosterReadService.getSeasonTeamPlayers({ transaction }),
    Config.findAll({ transaction }),
    Match.findAll({ transaction,
      include: [
        { model: Season },
        { model: Team, as: 'team1' },
        { model: Team, as: 'team2' },
        { model: Team, as: 'winner' }
      ],
      order: [['matchDate', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']]
    }),
    MapGame.findAll({ transaction,
      include: [
        { model: Team, as: 'winner' },
        { model: MapModel },
        { model: Hero, as: 'team1BanHero' },
        { model: Hero, as: 'team2BanHero' }
      ]
    }),
    PlayerStat.findAll({ transaction,
      include: [
        { model: Player, as: 'player' },
        { model: Hero, as: 'hero' },
        { model: Team, as: 'team' },
        {
          model: MapGame,
          include: [
            { model: Match, attributes: ['id', 'matchDate', 'team1Id', 'team2Id', 'winnerId', 'team1Score', 'team2Score', 'boFormat'] },
            { model: MapModel, attributes: ['id', 'name', 'type'] }
          ]
        },
        {
          model: PlayerHeroStat,
          as: 'heroStats',
          include: [{ model: Hero, as: 'hero' }]
        }
      ],
      order: [['id', 'ASC']]
    }),
    PlayerHeroStat.findAll({ transaction, raw: true, order: [['id', 'ASC']] }),
    MapGameTimeline.findAll({ transaction, raw: true }),
    SeasonStage.findAll({ transaction, raw: true })
  ]));

  const seasons = seasonModels.map(plain);
  const teams = teamModels.map(plain);
  const players = playerModels.map(plain);
  const maps = mapModels.map(plain);
  const heroes = heroModels.map(plain);
  const seasonTeams = seasonTeamModels.map(plain);
  const seasonTeamPlayers = seasonTeamPlayerModels.map(plain);
  const matches = matchModels.map(plain);
  const mapGamesDetailed = mapGameModels.map(plain);
  const playerStatsDetailed = playerStatModels.map(plain);
  const playerHeroStats = playerHeroStatModels.map(plain);
  const rawMatches = matches.map(match => withoutKeys(match, ['Season', 'team1', 'team2', 'winner']));
  const rawMapGames = mapGamesDetailed.map(game => withoutKeys(game, ['winner', 'Map', 'team1BanHero', 'team2BanHero']));
  const rawPlayerStats = playerStatsDetailed.map(stat => withoutKeys(stat, ['player', 'hero', 'team', 'MapGame', 'heroStats']));
  const timelines = Object.fromEntries(timelineModels.map(row => [row.mapGameId, plain(row)]));
  const collections = {
    seasons, teams, players, maps, heroes, seasonTeams, seasonTeamPlayers, matches,
    mapGames: mapGamesDetailed.map(game => ({ ...game,
      timeline: timelines[game.id] ? withoutKeys(timelines[game.id], ['payload']) : null
    })),
    playerStats: playerStatsDetailed.map(stat => withoutKeys(stat, ['MapGame']))
  };
  const views = { config: {}, seasonStats: {}, playerProfiles: {}, heroOverview: {}, heroPlayers: {}, playerHeroes: {}, matchData: {} };
  const gamesByMatch = new Map(), statsByGame = new Map();
  for (const game of collections.mapGames) pushGrouped(gamesByMatch, game.matchId, game);
  for (const stat of collections.playerStats) pushGrouped(statsByGame, stat.mapGameId, stat);
  for (const match of matches) {
    const games = gamesByMatch.get(String(match.id)) || [];
    views.matchData[match.id] = buildMatchDataDetail({
      match,
      mapGames: games.map(game => ({ ...game, timeline: timelines[game.id] || null })),
      playerStats: games.flatMap(game => statsByGame.get(String(game.id)) || [])
    });
  }
  const expectedConfigKeys = new Set([
    'latest_match_sync_updates', 'visualize_chart_config', 'visualize_stage_season_order',
    ...seasons.map(season => `visualize_season_${season.id}`)
  ]);
  for (const key of expectedConfigKeys) views.config[key] = {};
  for (const model of configModels) {
    const config = plain(model);
    if (expectedConfigKeys.has(config.key)) views.config[config.key] = config.value;
  }

  const rosterBySeasonTeam = new Map();
  for (const relation of seasonTeamPlayers) pushGrouped(rosterBySeasonTeam, relation.seasonTeamId, relation);
  const teamsById = new Map(teams.map(team => [Number(team.id), team]));

  const gameById = new Map(rawMapGames.map(game => [Number(game.id), game]));
  const seasonById = new Map(seasons.map(season => [Number(season.id), season]));
  const playerSeasonPairs = new Set();
  for (const seasonTeam of seasonTeams) {
    for (const relation of rosterBySeasonTeam.get(String(seasonTeam.id)) || []) {
      playerSeasonPairs.add(`${relation.playerId}:${seasonTeam.seasonId}`);
    }
  }
  // Include actual appearances as well as registered roster membership.
  for (const stat of rawPlayerStats) {
    const game = gameById.get(Number(stat.mapGameId));
    if (game) playerSeasonPairs.add(`${stat.playerId}:${game.seasonId}`);
  }
  const publicRawData = {
    playerStats: playerStatsDetailed, mapGames: rawMapGames, playerHeroStats, heroes, players,
    playerById: new Map(players.map(player => [Number(player.id), player])),
    gameById, teamById: teamsById, seasonById
  };
  const publicOptions = { rawData: publicRawData };
  for (const player of players) {
    views.playerProfiles[player.id] = {
      all: await PublicStatsService.getPlayerProfile(player.id, publicOptions), bySeason: {}
    };
    for (const pair of playerSeasonPairs) {
      const [playerId, seasonId] = pair.split(':').map(Number);
      if (playerId !== Number(player.id)) continue;
      views.playerProfiles[player.id].bySeason[seasonId] = await PublicStatsService.getPlayerProfile(player.id, { ...publicOptions, seasonId });
      views.playerHeroes[`${seasonId}:${player.id}`] = await PublicStatsService.getPlayerHeroes(seasonId, player.id, publicOptions);
    }
  }
  for (const season of seasons) {
    views.heroOverview[season.id] = await PublicStatsService.getHeroOverview(season.id, publicOptions);
    for (const hero of heroes) {
      views.heroPlayers[`${season.id}:${hero.id}`] = await PublicStatsService.getHeroPlayers(season.id, hero.id, publicOptions);
    }
  }

  const teamById = teamsById;
  const mapById = new Map(maps.map(map => [Number(map.id), map]));
  const playerById = new Map(players.map(player => [Number(player.id), player]));
  const heroRoleById = new Map(heroes.map(hero => [Number(hero.id), hero.role]));
  for (const season of seasons) {
    const seasonId = Number(season.id);
    const seasonMatches = rawMatches
      .filter(match => Number(match.seasonId) === seasonId)
      .sort((a, b) => (
        new Date(a.matchDate || 0) - new Date(b.matchDate || 0)
        || Number(a.id) - Number(b.id)
      ));
    const seasonMapGames = rawMapGames.filter(game => Number(game.seasonId) === seasonId);
    const seasonGameIds = new Set(seasonMapGames.map(game => Number(game.id)));
    const seasonPlayerStats = rawPlayerStats.filter(stat => seasonGameIds.has(Number(stat.mapGameId)));
    const rawData = {
      matches: seasonMatches,
      mapGames: seasonMapGames,
      playerStats: seasonPlayerStats,
      seasonTeamIds: seasonTeams
        .filter(item => Number(item.seasonId) === seasonId)
        .map(item => Number(item.teamId)),
      teamById,
      mapById,
      playerById,
      gameById: new Map(seasonMapGames.map(game => [Number(game.id), game]))
    };
    const calculatorOptions = { rawData, playerHeroStats, heroRoleById };
    const stageRanges = SeasonStageService.buildStageRanges(seasonMatches, stageModels.filter(stage => Number(stage.seasonId) === seasonId));
    const seasonView = views.seasonStats[seasonId] = { teams: {}, stageStats: {} };

    seasonView.players = await SeasonStatsCalculator.calculateSeasonPlayerStats(seasonId, calculatorOptions);
    seasonView.teamScore = await SeasonStatsCalculator.calculateSeasonTeamScoreStats(seasonId, calculatorOptions);
    seasonView.mapPicks = await SeasonStatsCalculator.calculateSeasonMapPickStats(seasonId, calculatorOptions);
    seasonView.stages = stageRanges.map(SeasonStageService.serializeStageRange);
    seasonView.features = await PublicStatsService.getSeasonFeatures(seasonId, publicOptions);

    const addTeamViews = async (target, options) => {
      for (const seasonTeam of seasonTeams.filter(item => Number(item.seasonId) === seasonId)) {
        target.teams[seasonTeam.teamId] = {
          compositions: await SeasonStatsCalculator.calculateSeasonTeamCompositions(seasonId, seasonTeam.teamId, options),
          heroStats: await SeasonStatsCalculator.calculateSeasonTeamHeroStats(seasonId, seasonTeam.teamId, options)
        };
      }
    };
    await addTeamViews(seasonView, calculatorOptions);
    for (const range of stageRanges) {
      const options = { ...calculatorOptions, matchIds: range.matchIds };
      const stageView = seasonView.stageStats[range.id] = {
        players: await SeasonStatsCalculator.calculateSeasonPlayerStats(seasonId, options),
        teamScore: await SeasonStatsCalculator.calculateSeasonTeamScoreStats(seasonId, options),
        mapPicks: await SeasonStatsCalculator.calculateSeasonMapPickStats(seasonId, options),
        teams: {}
      };
      await addTeamViews(stageView, options);
    }

  }

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: 'OWCS Stats server-side static snapshot',
    counts: {
      seasons: seasons.length,
      teams: teams.length,
      players: players.length,
      maps: maps.length,
      heroes: heroes.length,
      matches: matches.length,
      mapGames: rawMapGames.length,
      timelines: timelineModels.length
    },
    schedule,
    collections,
    views,
    timelines
  };
};

module.exports = { buildStaticExportSnapshot };
