const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('export reads every collection in one transaction, preserves timelines and actual appearances', async () => {
  const calls = [], transaction = { id: 'one-consistent-snapshot' };
  const data = {
    Season: [{ id: 1, name: 'Fixture' }], Team: [{ id: 1 }, { id: 2 }], Player: [{ id: 7, name: 'P', role: 'd' }, { id: 8 }], Map: [{ id: 9 }], Hero: [],
    SeasonTeam: [{ id: 1, seasonId: 1, teamId: 1, players: [{ id: 22 }] }],
    SeasonTeamPlayer: [{ id: 22, seasonTeamId: 1, playerId: 8, SeasonTeam: { id: 1, seasonId: 1, teamId: 1 } }],
    SeasonTeamSource: [{ seasonTeamId: 1, sourceType: 'manual' }],
    SeasonTeamPlayerSource: [{ seasonTeamPlayerId: 22, sourceType: 'liquipedia' }], Config: [],
    Match: Array.from({ length: 2107 }, (_, i) => ({ id: i + 1, seasonId: 1, matchDate: '2026-09-09', team1Id: 1, team2Id: 2 })),
    MapGame: [{ id: 5001, matchId: 2107, seasonId: 1, mapId: 9, team1Id: 1, team2Id: 2, duration: null }],
    PlayerStat: [{ id: 1, playerId: 7, teamId: 1, mapGameId: 5001, kills: 0, finalBlows: null, MapGame: { id: 5001, seasonId: 1, Match: { id: 2107 }, Map: { id: 9 } } }],
    PlayerHeroStat: [], MapGameTimeline: [{ mapGameId: 5001, revision: 2, payload: { events: [{ type: 'kill' }] } }],
    SeasonStage: [{ id: 4, seasonId: 1, startMatchId: 2107, name: 'Final' }],
    TournamentSnapshot: [{ sourceKey: 'fixture', page: 'Fixture', payload: { version: 2, page: 'Fixture', observedAt: 123,
      blocks: [{ type: 'standings', rows: [{ team: { name: 'Source Alias' }, rank: '1' }] }] } }],
    TeamAlias: [{ teamId: 1, alias: 'Source Alias' }]
  };
  const saved = new Map();
  const teamPages = ['https://liquipedia.net/overwatch/Original', 'https://liquipedia.net/overwatch/Renamed'];
  Object.assign(data.Team[0], { liquipediaUrl: teamPages[0], liquipediaUrls: teamPages });
  data.TournamentSnapshot[0].payload.blocks[0].rows.push({ team: { name: 'Changed source name', url: teamPages[1] }, rank: '2' });
  data.Team.push({ id: 3, name: 'Unregistered', liquipediaUrls: ['https://liquipedia.net/overwatch/Unregistered'] });
  data.TournamentSnapshot[0].payload.blocks[0].rows.push({ team: { name: 'Old source name', url: data.Team[2].liquipediaUrls[0] }, rank: '3' });
  data.Config.push({ key: 'visualize_season_1', value: { liquipediaTournamentUrl: 'https://liquipedia.net/overwatch/Fixture' } });
  const stub = (relative, exports) => {
    const filename = require.resolve(path.join(__dirname, relative));
    saved.set(filename, require.cache[filename]);
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
  };
  for (const [name, rows] of Object.entries(data)) stub(`../models/${name}`, {
    findAll: async options => { calls.push({ name, options }); return rows; }
  });
  stub('../config/database', { transaction: async (options, work) => {
    assert.equal(options.isolationLevel, 'REPEATABLE READ'); return work(transaction);
  } });
  stub('../services/UpcomingMatchesService', { getUpcomingSchedule: () => { throw new Error('Unexpected network read'); } });
  const calculations = [];
  stub('../services/SeasonStatsCalculator', Object.fromEntries([
    'calculateSeasonPlayerStats', 'calculateSeasonTeamScoreStats', 'calculateSeasonMapPickStats', 'calculateSeasonTeamCompositions', 'calculateSeasonTeamHeroStats', 'calculatePlayerSeasonHistory'
  ].map(name => [name, async (...args) => {
    const options = args.at(-1); assert.ok(options.rawData); calculations.push({ name, matchIds: options.matchIds }); return [{ method: name }];
  }])));
  const servicePath = require.resolve('../services/StaticExportSnapshotService');
  delete require.cache[servicePath];
  try {
    const { buildStaticExportSnapshot } = require(servicePath);
    const snapshot = await buildStaticExportSnapshot({ schedule: { data: [], observedAt: 123, stale: false } });
    assert.equal(snapshot.schemaVersion, 2);
    assert.equal(snapshot.counts.matches, 2107);
    assert.equal(snapshot.collections.matches.at(-1).id, 2107);
    assert.deepEqual(snapshot.timelines[5001].payload, data.MapGameTimeline[0].payload);
    assert.equal(snapshot.collections.mapGames[0].timeline.payload, undefined);
    assert.equal(snapshot.views.matchData[2107].summary.timelineMaps, 1);
    assert.equal(snapshot.views.tournaments[1].offline, true);
    assert.equal(snapshot.views.tournaments[1].blocks[0].rows[0].team.teamId, 1);
    assert.equal(snapshot.views.tournaments[1].blocks[0].rows[1].team.teamId, 1);
    assert.equal(snapshot.views.tournaments[1].blocks[0].rows[2].team.teamId, 3);
    assert.deepEqual(snapshot.collections.teams[0].liquipediaUrls, teamPages);
    assert.equal(snapshot.views.matchData[2107].mapGames[0].timeline.counts.events, 1);
    assert.equal(snapshot.collections.playerStats[0].finalBlows, null);
    assert.deepEqual(snapshot.collections.seasonTeams[0].sources, [{ sourceType: 'manual' }]);
    assert.deepEqual(snapshot.collections.seasonTeams[0].players, [{ id: 22 }]);
    assert.deepEqual(snapshot.collections.seasonTeamPlayers[0].sources, [{ sourceType: 'liquipedia' }]);
    assert.equal(snapshot.collections.seasonTeamPlayers[0].SeasonTeam.seasonId, 1);
    assert.ok(snapshot.views.playerProfiles[7].bySeason[1], 'appearance without registered roster is still exported');
    assert.equal(calls.length, Object.keys(data).length);
    assert.ok(calls.every(call => call.options.transaction === transaction && call.options.limit === undefined));
    assert.ok(calls.filter(call => call.name.endsWith('Source')).every(call => call.options.where.active === true));
    assert.equal(calculations.filter(call => call.matchIds?.length === 1 && call.matchIds[0] === 2107).length, 5);
    assert.equal(Object.hasOwn(snapshot, 'responses'), false);
    // A new shared result field must reach the export without editing a second
    // formula or a field whitelist. This protects the one-maintenance-path contract.
    const publicStats = require('../services/PublicStatsService');
    const methods = ['getPlayerProfile', 'getHeroOverview', 'getHeroPlayers', 'getPlayerHeroes', 'getSeasonFeatures'];
    const originals = Object.fromEntries(methods.map(name => [name, publicStats[name]]));
    const result = { futureMetric: { value: 42 }, data: [] };
    data.Hero.push({ id: 8 });
    // One source spans two local seasons. Offline links must carry the same
    // actual match season as the live endpoint, excluding a sibling qualifier.
    data.Season.push({ id: 2, name: 'Playoffs' }, { id: 3, name: 'Qualifier' });
    data.Config.push(
      { key: 'visualize_season_2', value: { liquipediaTournamentUrl: 'https://liquipedia.net/overwatch/Fixture' } },
      { key: 'visualize_season_3', value: { liquipediaTournamentUrl: 'https://liquipedia.net/overwatch/Fixture/Qualifier' } }
    );
    for (const seasonId of [2, 3]) data.Match.push({ id: 3000 + seasonId, seasonId, matchDate: '2026-09-13', team1Id: 1, team2Id: 3, team1Score: 3, team2Score: 1 });
    data.TournamentSnapshot[0].payload.blocks.push({ type: 'matches', sourceTitle: 'Playoffs', matches: [{
      timestamp: Date.parse('2026-09-13T12:00:00Z'), opponents: [
        { name: 'Original', url: teamPages[0], score: 3 },
        { name: 'Unregistered', url: data.Team[2].liquipediaUrls[0], score: 1 }
      ]
    }] });
    for (const method of methods) publicStats[method] = async () => result;
    try {
      const updated = await buildStaticExportSnapshot({ schedule: { data: [], observedAt: 123, stale: false } });
      for (const id of [1, 2]) {
        const linked = updated.views.tournaments[id].blocks[1].matches[0];
        assert.equal(linked.matchId, 3002);
        assert.equal(linked.matchSeasonId, 2);
      }
      for (const view of [updated.views.playerProfiles[7].all, updated.views.playerProfiles[7].bySeason[1],
        updated.views.heroOverview[1], updated.views.heroPlayers['1:8'], updated.views.playerHeroes['1:7'], updated.views.seasonStats[1].features]) {
        assert.deepEqual(view, result);
      }
    } finally { Object.assign(publicStats, originals); }
  } finally {
    delete require.cache[servicePath];
    for (const [filename, cached] of saved) {
      if (cached) require.cache[filename] = cached; else delete require.cache[filename];
    }
  }
});
