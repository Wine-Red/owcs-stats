const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('season read API derives three states from visual date ranges instead of stored status', async t => {
  const saved = new Map();
  const stub = (relative, exports) => {
    const filename = require.resolve(path.join(__dirname, relative));
    saved.set(filename, require.cache[filename]);
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
  };
  const seasons = [
    { id: 1, name: 'ended', status: 'in_progress' },
    { id: 2, name: 'active', status: 'completed' },
    { id: 3, name: 'future', status: 'completed' }
  ];
  const configs = seasons.map((season, index) => ({
    key: `visualize_season_${season.id}`,
    value: { dateRange: [
      '2020.01.01 - 2020.01.02',
      '2000.01.01 - 2099.12.31',
      '2099.01.01 - 2099.01.02'
    ][index] }
  }));
  stub('../models/Season', { findAll: async () => seasons, findByPk: async id => seasons.find(row => row.id === Number(id)) });
  stub('../models/Config', { findAll: async () => configs, findByPk: async key => configs.find(row => row.key === key) });
  for (const model of ['Match', 'MapGame', 'PlayerStat', 'SeasonTeam', 'SeasonTeamPlayer', 'SeasonStage']) {
    stub(`../models/${model}`, {});
  }
  stub('../services/TournamentRuntime', { wakeTournamentSync() {} });
  const controllerPath = require.resolve('../controllers/SeasonController');
  saved.set(controllerPath, require.cache[controllerPath]);
  delete require.cache[controllerPath];
  t.after(() => { for (const [filename, original] of saved) {
    if (original) require.cache[filename] = original;
    else delete require.cache[filename];
  } });
  const controller = require(controllerPath);
  const response = () => ({ status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
  const list = response();
  await controller.getAll({}, list);
  assert.equal(list.code, 200);
  assert.deepEqual(list.body.map(row => row.status), ['completed', 'in_progress', 'upcoming']);
  const single = response();
  await controller.getById({ params: { id: 3 } }, single);
  assert.equal(single.body.status, 'upcoming');
  assert.equal(single.body.dateRange, '2099.01.01 - 2099.01.02');
});
