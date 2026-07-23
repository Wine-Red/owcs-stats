const test = require('node:test');
const assert = require('node:assert/strict');
const AnalyticsExecutor = require('../services/agent/AnalyticsExecutor');

test('player aggregation applies per-10 and sample thresholds deterministically', () => {
  const executor = new AnalyticsExecutor();
  const rows = executor.playerRows({
    metric: 'damage_per_10', minimumMaps: 2, minimumMinutes: 10
  }, {
    players: [{ id: 1, name: 'Alpha', role: 'damage' }],
    teams: [{ id: 2, name: 'Team A' }],
    mapGames: [{ id: 10, duration: 8 }, { id: 11, duration: 12 }],
    playerStats: [
      { id: 1, mapGameId: 10, playerId: 1, teamId: 2, damage: 8000, kills: 10 },
      { id: 2, mapGameId: 11, playerId: 1, teamId: 2, damage: 12000, kills: 15 }
    ]
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 10000);
  assert.equal(rows[0].mapsPlayed, 2);
  assert.equal(rows[0].minutesPlayed, 20);
});

test('entity matching reports names that do not exist', () => {
  const { matchNames } = AnalyticsExecutor._private;
  const result = matchNames([{ id: 1, name: 'Team Alpha' }], ['missing']);
  assert.equal(result.ids.size, 0);
  assert.deepEqual(result.unresolved, ['missing']);
});

test('hero usage ranking does not treat ban-only heroes as usage rows', () => {
  const executor = new AnalyticsExecutor();
  const rows = executor.heroRows({ metric: 'hero_usage_seconds' }, {
    playerStats: [],
    heroStats: [],
    heroes: [{ id: 1, name: 'Hero A' }],
    mapGames: [{ team1BanHeroId: 1, team2BanHeroId: null }],
    heroMatch: { ids: null }
  });
  assert.deepEqual(rows, []);
});
