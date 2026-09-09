const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

// Exercise both loaders without a database, then verify the actual calculations
// against explicit expected results (rather than only comparing them to themselves).
const modelNames = ['Player', 'PlayerStat', 'PlayerHeroStat', 'MapGame', 'Match', 'Map', 'Hero', 'Team', 'Season', 'SeasonTeam'];
let fixture, reads = 0;
const saved = new Map();
const stub = (module, exports) => {
  const filename = require.resolve(module);
  saved.set(filename, require.cache[filename]);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
};
const matches = (row, where = {}) => Object.entries(where).every(([key, value]) =>
  value?.[Op.in] ? value[Op.in].map(Number).includes(Number(row[key])) : String(row[key]) === String(value));
for (const name of modelNames) stub(`../models/${name}`, {
  findAll: async (options = {}) => {
    reads++;
    const rows = structuredClone(fixture[name] || []).filter(row => matches(row, options.where));
    if (options.order) rows.sort((a, b) => a.id - b.id);
    return options.raw ? rows : rows.map(row => ({ ...row, get: () => row }));
  },
  findByPk: async id => { reads++; return structuredClone((fixture[name] || []).find(row => Number(row.id) === Number(id))); }
});
stub('../services/SeasonStageService', {});
const service = require('../services/PublicStatsService');
const history = require('../services/SeasonStatsCalculator').calculatePlayerSeasonHistory;
const controller = require('../controllers/StatsController');
const seasonController = require('../controllers/SeasonStatController');
const normalize = value => JSON.parse(JSON.stringify(value));

const reset = () => {
  const player = { id: 7, name: 'P', role: 'd' };
  const teams = [{ id: 1, name: 'A', region: 'CN', logo: '/a.png' }, { id: 2, name: 'B', region: 'KR', logo: '/b.png' }];
  const heroes = [{ id: 11, name: 'Hero', role: 'd', subRole: 'hitscan' }, { id: 12, name: 'Ban only' }];
  const games = [
    { id: 101, seasonId: 1, matchId: 201, duration: 10, team1Id: 1, team2Id: 2, winnerId: 1, team1BanHeroId: 12, team2BanHeroId: null, Map: { id: 3, name: 'Map' }, Match: { id: 201, matchDate: '2026-09-01' } },
    { id: 102, seasonId: 1, matchId: 202, duration: 20, team1Id: 1, team2Id: 2, winnerId: null, team1BanHeroId: null, team2BanHeroId: null, Map: { id: 3, name: 'Map' }, Match: { id: 202, matchDate: '2026-09-02' } },
    { id: 103, seasonId: 2, matchId: 203, duration: 5, winnerId: 2, Map: { id: 3 }, Match: { id: 203, matchDate: '2026-09-03' } }
  ];
  // Shuffled insertion order deliberately differs from player-stat chronology.
  const stats = [
    { id: 30, playerId: 7, teamId: 2, heroId: 11, mapGameId: 102, kills: 4, deaths: 0, assists: 2, finalBlows: 2 },
    { id: 10, playerId: 7, teamId: 1, heroId: 11, mapGameId: 101, kills: 6, deaths: 2, assists: 1, finalBlows: 4 },
    { id: 40, playerId: 7, teamId: 2, heroId: null, mapGameId: 103, kills: 3, deaths: null, finalBlows: null }
  ].map(stat => ({ ...stat, MapGame: games.find(game => game.id === stat.mapGameId),
    hero: stat.heroId ? { ...heroes[0], icon: '/not-a-profile-field.png' } : null,
    team: { ...teams.find(team => team.id === stat.teamId), extra: 'not-a-profile-field' } }));
  const heroStats = [
    { id: 1, playerStatId: 30, heroId: 11, heroName: 'Hero', usageSeconds: 60, finalBlows: 2, deathsByFinalBlow: 0, avgUltChargeSeconds: 30 },
    { id: 9, playerStatId: 10, heroId: 11, heroName: 'Hero', usageSeconds: 120, finalBlows: 4, deathsByFinalBlow: 2, avgUltChargeSeconds: 10 },
    { id: 2, playerStatId: 30, heroId: 11, heroName: 'Hero alias', usageSeconds: 0, finalBlows: 0, deathsByFinalBlow: 0, avgUltChargeSeconds: 0 },
    { id: 3, playerStatId: 30, heroId: null, heroName: 'Unmatched', usageSeconds: 15, finalBlows: 1, avgUltChargeSeconds: null },
    { id: 4, playerStatId: 40, heroId: 11, heroName: 'Hero', usageSeconds: 1000, finalBlows: 100, avgUltChargeSeconds: 100 },
    { id: 5, playerStatId: 999, heroId: 11, heroName: 'Orphan', usageSeconds: 1000, finalBlows: 100, avgUltChargeSeconds: 100 }
  ];
  fixture = { Player: [player], Team: teams, Hero: heroes, MapGame: games, PlayerStat: stats, PlayerHeroStat: heroStats, Season: [{ id: 1, name: 'S1' }, { id: 2, name: 'S2' }] };
  reads = 0;
  return { players: fixture.Player, heroes, mapGames: games, playerStats: stats, playerHeroStats: heroStats,
    playerById: new Map([[7, player]]), gameById: new Map(games.map(game => [game.id, game])),
    teamById: new Map(teams.map(team => [team.id, team])), seasonById: new Map(fixture.Season.map(season => [season.id, season])) };
};

test('profile and history retain season filters, totals, latest team and recent-match ordering', async () => {
  const rawData = reset();
  const profile = await service.getPlayerProfile(7, { rawData, seasonId: 1 });
  assert.equal(profile.totals.mapsPlayed, 2);
  assert.equal(profile.totals.kills, 10);
  assert.equal(profile.totals.duration, 30);
  assert.deepEqual(profile.recentMaps.map(row => row.mapGameId), [102, 101]);
  assert.equal(profile.heroPool[0].usageRate, 100);
  assert.equal(profile.heroPool[0].kd, 5);
  assert.deepEqual(profile.seasonHistory.map(row => [row.seasonId, row.elims, row.teamId]), [[1, 10, 2], [2, 3, 2]]);
  assert.equal(profile.seasonHistory[0].elimsPerMin, 10 / 30);
  assert.equal(profile.seasonHistory[1].kd, 3);
  assert.equal(profile.recentMaps[0].team.extra, undefined);
  assert.equal(profile.recentMaps[0].hero.icon, undefined);
  assert.equal((await service.getPlayerProfile(7, { rawData })).totals.mapsPlayed, 3);
  assert.equal((await service.getPlayerProfile(7, { rawData, seasonId: 999 })).totals.mapsPlayed, 0);
  assert.equal(await service.getPlayerProfile(999, { rawData }), null);
  assert.equal(reads, 0, 'preloaded snapshot must never query a database');
});

test('hero overview preserves distinct picks, ban-only heroes, unweighted average and NULL boundaries', async () => {
  const rawData = reset(), before = structuredClone(rawData);
  const result = await service.getHeroOverview(1, { rawData });
  assert.equal(result.totalMapGames, 2);
  assert.deepEqual(result.data.map(row => row.heroId), [11, 12]);
  const hero = result.data[0];
  assert.equal(hero.pickCount, 2, 'two aliases in one player stat count as one pick');
  assert.equal(hero.mapsAppeared, 2);
  assert.equal(hero.winRate, 0.5);
  assert.equal(hero.usageSeconds, 180);
  assert.equal(hero.finalBlowsPer10, 20);
  assert.equal(hero.avgUltChargeSeconds, 40 / 3, 'overview is an unweighted mean including measured zero');
  assert.equal(result.data[1].banRate, 0.5);
  assert.equal(result.data[1].pickCount, 0);
  assert.equal(result.data[1].avgUltChargeSeconds, null);
  assert.deepEqual(rawData, before, 'aggregation must not mutate shared snapshot input');
  assert.equal(reads, 0);
});

test('hero leaderboards use weighted charge, distinct maps and latest player-stat team', async () => {
  const rawData = reset();
  const { data } = await service.getHeroPlayers(1, 11, { rawData });
  assert.equal(data.length, 1);
  assert.equal(data[0].teamId, 2, 'player-stat order, not hero-stat order, determines latest team');
  assert.equal(data[0].mapsPlayed, 2);
  assert.equal(data[0].avgUltChargeSeconds, 3000 / 180);
  assert.equal(data[0].fbPerDeath, 3);
  const player = await service.getPlayerHeroes(1, 7, { rawData });
  assert.deepEqual(player.data.map(row => row.heroId), [11, 0], 'preserve live unmatched-hero grouping');
  assert.equal(player.data[0].avgUltChargeSeconds, data[0].avgUltChargeSeconds);
  assert.equal(player.data[1].fbPerDeath, null);
  assert.equal(player.data[1].avgUltChargeSeconds, null);
  assert.deepEqual(await service.getHeroPlayers(1, 0, { rawData }), { data: [] });
  assert.equal(reads, 0);
});

test('feature flags distinguish absent values from measured zero and exclude other seasons', async () => {
  const rawData = reset();
  assert.deepEqual(await service.getSeasonFeatures(1, { rawData }), {
    seasonId: 1, totalMapGames: 2, hasBans: true, hasHeroStats: true, hasFinalBlows: true, hasUltCharge: true
  });
  assert.deepEqual(await service.getSeasonFeatures(999, { rawData }), {
    seasonId: 999, totalMapGames: 0, hasBans: false, hasHeroStats: false, hasFinalBlows: false, hasUltCharge: false
  });
  rawData.playerHeroStats = [{ id: 1, playerStatId: 10, avgUltChargeSeconds: null, ultReady: 0, ultUsed: 0 }];
  assert.equal((await service.getSeasonFeatures(1, { rawData })).hasUltCharge, false);
  delete rawData.playerHeroStats[0].avgUltChargeSeconds;
  assert.equal((await service.getSeasonFeatures(1, { rawData })).hasUltCharge, false);
  rawData.playerHeroStats[0].avgUltChargeSeconds = 0;
  assert.equal((await service.getSeasonFeatures(1, { rawData })).hasUltCharge, true);
});

test('database and snapshot paths return identical complete results for every shared public view', async () => {
  const rawData = reset();
  for (const [method, args] of [
    ['getPlayerProfile', [7]], ['getPlayerProfile', [999]],
    ['getHeroOverview', [1]], ['getHeroOverview', [2]], ['getHeroOverview', [999]],
    ['getHeroPlayers', [1, 11]], ['getPlayerHeroes', [1, 7]], ['getSeasonFeatures', [1]]
  ]) assert.deepEqual(normalize(await service[method](...args, { rawData })), normalize(await service[method](...args)), method);
  assert.deepEqual(normalize(await service.getPlayerProfile(7, { rawData, seasonId: 1 })), normalize(await service.getPlayerProfile(7, { seasonId: 1 })));
  assert.deepEqual(await history(7, { rawData }), await history(7));
  assert.ok(reads > 0);
});

test('HTTP controllers forward shared results including future fields and keep validation', async () => {
  const invoke = async (method, params = {}, query = {}) => {
    let status = 200, body;
    await method({ params, query }, { status(code) { status = code; return this; }, json(value) { body = value; return this; } });
    return { status, body };
  };
  for (const [name, target, params, query] of [
    ['getPlayerProfile', controller.getPlayerProfile, { playerId: '7' }, {}],
    ['getHeroOverview', controller.getHeroOverview, {}, { seasonId: '1' }],
    ['getHeroPlayers', controller.getHeroPlayers, {}, { seasonId: '1', heroId: '11' }],
    ['getPlayerHeroes', controller.getPlayerHeroes, {}, { seasonId: '1', playerId: '7' }],
    ['getSeasonFeatures', seasonController.getSeasonFeatures, { seasonId: '1' }, {}]
  ]) {
    const original = service[name], result = { futureMetric: { value: 42 }, data: [] };
    service[name] = async () => result;
    try { assert.deepEqual(await invoke(target, params, query), { status: 200, body: result }); }
    finally { service[name] = original; }
  }
  assert.equal((await invoke(controller.getPlayerProfile, { playerId: 'invalid' })).status, 400);
  assert.equal((await invoke(controller.getHeroOverview, {}, { seasonId: 'invalid' })).status, 400);
  reset();
  assert.equal((await invoke(controller.getPlayerProfile, { playerId: '999' })).status, 404);
});

test.after(() => {
  for (const [filename, cached] of saved) {
    if (cached) require.cache[filename] = cached; else delete require.cache[filename];
  }
});
