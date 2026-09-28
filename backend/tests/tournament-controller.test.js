const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { bindTournament } = require('../services/TournamentMatchMatcher');
const { Op } = require('sequelize');

for (const related of [false, true]) test(`tournament controller restricts queries and links to ${related ? 'explicitly shared source seasons' : 'the selected season'}`, async t => {
  const saved = new Map();
  const stub = (relative, exports) => {
    const filename = require.resolve(path.join(__dirname, relative));
    saved.set(filename, require.cache[filename]);
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
  };
  const teams = [
    { id: 1, name: 'A', liquipediaUrl: 'https://liquipedia.net/overwatch/A' },
    { id: 2, name: 'B', liquipediaUrls: ['https://liquipedia.net/overwatch/B'] }
  ];
  const source = { blocks: [{ type: 'matches', matches: [{ timestamp: Date.parse('2026-06-11T10:00:00Z'),
    opponents: teams.map(team => ({ name: 'Old source name', url: team.liquipediaUrl || team.liquipediaUrls[0] })) }] }] };
  const matches = (related ? [24, 25] : [13, 24]).map((seasonId, i) => ({ id: i + 99, seasonId, team1Id: 1, team2Id: 2, matchDate: '2026-06-11' }));
  const config = { value: { liquipediaTournamentUrl: 'https://liquipedia.net/overwatch/Fixture' } };
  stub('../models/Season', { findByPk: async id => ({ id, name: 'Fixture' }), findAll: async () => [13, 24, 25].map(id => ({ id, name: 'Fixture' })) });
  stub('../models/Config', { findByPk: async () => config, findAll: async () => [
    { key: 'visualize_season_13', ...config },
    { key: 'visualize_season_24', value: related ? config.value : { liquipediaTournamentUrl: 'https://liquipedia.net/overwatch/Fixture/Qualifier' } }
  ] });
  stub('../models/SeasonTeam', { findAll: async options => { assert.deepEqual(options.where, { seasonId: 13 }); return []; } });
  stub('../models/Team', { findAll: async options => { assert.equal(options.where, undefined); return teams; } });
  stub('../models/TeamAlias', { findAll: async options => { assert.equal(options.where, undefined); return []; } });
  stub('../models/Match', { findAll: async options => { assert.deepEqual(options.where, { seasonId: { [Op.in]: related ? [13, 24] : [13] } }); return matches; } });
  stub('../services/TournamentRuntime', { getTournamentService: () => ({ get: async (url, catalog) => {
    assert.equal(url, 'https://liquipedia.net/overwatch/Fixture');
    assert.deepEqual(catalog.teams, []);
    assert.deepEqual(catalog.allTeams, teams);
    assert.equal(catalog.seasonId, 13);
    return bindTournament(source, catalog);
  } }) });
  const controllerPath = require.resolve('../controllers/LiquipediaTournamentController');
  saved.set(controllerPath, require.cache[controllerPath]); delete require.cache[controllerPath];
  t.after(() => { for (const [filename, original] of saved) {
    if (original) require.cache[filename] = original; else delete require.cache[filename];
  } });
  let result, status = 200;
  const res = { status(value) { status = value; return this; }, json(value) { result = value; return this; } };
  await require(controllerPath).get({ params: { seasonId: '13' } }, res);
  assert.equal(status, 200);
  assert.deepEqual(result.blocks[0].matches[0].opponents.map(team => team.teamId), [1, 2]);
  assert.equal(result.blocks[0].matches[0].matchId, 99);
  assert.equal(result.blocks[0].matches[0].matchSeasonId, related ? 24 : 13);
  assert.equal(result.seasonId, 13);
});
