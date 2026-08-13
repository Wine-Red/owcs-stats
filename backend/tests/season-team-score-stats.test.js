const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSeasonTeamScoreStats } = require('../services/SeasonStatsCalculator');

const teams = [
  { id: 1, name: 'Alpha', shortName: 'A' },
  { id: 2, name: 'Bravo', shortName: 'B' },
  { id: 3, name: 'Charlie', shortName: 'C' }
];

const rawData = ({ matches = [], seasonTeamIds = teams.map(team => team.id) } = {}) => ({
  matches,
  mapGames: [],
  playerStats: [],
  seasonTeamIds,
  teamById: new Map(teams.map(team => [team.id, team])),
  mapById: new Map(),
  playerById: new Map(),
  gameById: new Map()
});

test('configured season teams remain in standings before any matches are imported', async () => {
  const standings = await calculateSeasonTeamScoreStats(24, { rawData: rawData() });

  assert.deepEqual(standings.map(row => row.teamId), [1, 2, 3]);
  assert.ok(standings.every(row => (
    row.matchWin === 0
    && row.matchLoss === 0
    && row.mapWin === 0
    && row.mapLoss === 0
  )));
});

test('importing a partial schedule does not remove configured teams from standings', async () => {
  const standings = await calculateSeasonTeamScoreStats(24, {
    rawData: rawData({
      matches: [{
        id: 101,
        seasonId: 24,
        team1Id: 1,
        team2Id: 2,
        team1Score: 3,
        team2Score: 1
      }]
    })
  });
  const byTeamId = new Map(standings.map(row => [row.teamId, row]));

  assert.equal(standings.length, 3);
  assert.deepEqual(
    ['matchWin', 'matchLoss', 'mapWin', 'mapLoss', 'mapDiff'].map(key => byTeamId.get(1)[key]),
    [1, 0, 3, 1, 2]
  );
  assert.deepEqual(
    ['matchWin', 'matchLoss', 'mapWin', 'mapLoss', 'mapDiff'].map(key => byTeamId.get(2)[key]),
    [0, 1, 1, 3, -2]
  );
  assert.deepEqual(
    ['matchWin', 'matchLoss', 'mapWin', 'mapLoss', 'mapDiff'].map(key => byTeamId.get(3)[key]),
    [0, 0, 0, 0, 0]
  );
});

test('stage standings keep every configured team while filtering match results', async () => {
  const standings = await calculateSeasonTeamScoreStats(24, {
    rawData: rawData({
      matches: [
        { id: 101, seasonId: 24, team1Id: 1, team2Id: 2, team1Score: 3, team2Score: 1 },
        { id: 102, seasonId: 24, team1Id: 2, team2Id: 3, team1Score: 0, team2Score: 3 }
      ]
    }),
    matchIds: [102]
  });
  const byTeamId = new Map(standings.map(row => [row.teamId, row]));

  assert.equal(standings.length, 3);
  assert.equal(byTeamId.get(1).matchWin, 0);
  assert.equal(byTeamId.get(2).matchLoss, 1);
  assert.equal(byTeamId.get(3).matchWin, 1);
});
