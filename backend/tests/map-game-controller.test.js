const test = require('node:test');
const assert = require('node:assert/strict');
const MapGameController = require('../controllers/MapGameController');
const MapGame = require('../models/MapGame');
const Map = require('../models/Map');
const Team = require('../models/Team');
const MapGameTimeline = require('../models/MapGameTimeline');
const { Op } = require('sequelize');

test('raw map-game detail loads the registered map and timeline associations', async () => {
  const originalFindByPk = MapGame.findByPk;
  let capturedOptions = null;
  MapGame.findByPk = async (_id, options) => {
    capturedOptions = options;
    return { id: 42, timeline: { payload: { events: [] } } };
  };
  const response = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; }
  };
  try {
    await MapGameController.getById({ params: { id: '42' } }, response);
  } finally {
    MapGame.findByPk = originalFindByPk;
  }

  assert.equal(response.statusCode, 200);
  assert.deepEqual(capturedOptions.include, [
    { model: Team, as: 'winner' },
    { model: Map },
    { model: MapGameTimeline, as: 'timeline' }
  ]);
  assert.deepEqual(response.payload.timeline.payload, { events: [] });
});

test('online and static map filters include the entire end day and preserve explicit instants', async () => {
  const { readStaticData } = await import('../../src/services/staticSnapshot.mjs');
  const rows = [
    { id: 1, createdAt: '2026-09-09T23:59:59.999Z' },
    { id: 2, createdAt: '2026-09-10T00:00:00.000Z' },
    { id: 3, createdAt: '2026-09-10T12:00:00.000Z' },
    { id: 4, createdAt: '2026-09-10T23:59:59.999Z' },
    { id: 5, createdAt: '2026-09-11T00:00:00.000Z' },
    { id: 6, createdAt: '2026-09-10T12:00:00.000Z' }
  ];
  const original = MapGame.findAll;
  MapGame.findAll = async ({ where, order, limit, offset }) => {
    assert.deepEqual(order, [['createdAt', 'DESC'], ['id', 'DESC']]);
    const range = where.createdAt || {};
    return rows.filter(row => {
      const time = new Date(row.createdAt).getTime();
      return (!range[Op.gte] || time >= range[Op.gte].getTime())
        && (!range[Op.lt] || time < range[Op.lt].getTime())
        && (!range[Op.lte] || time <= range[Op.lte].getTime());
    }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id).slice(offset, offset + limit);
  };
  try {
    for (const [filter, ids] of [
      [{ startDate: '2026-09-10', endDate: '2026-09-10' }, [4, 6, 3, 2]],
      [{ endDate: '2026-09-10' }, [4, 6, 3, 2, 1]],
      [{ startDate: '2026-09-10T12:00:00Z', endDate: '2026-09-10T20:00:00+08:00' }, [6, 3]],
      [{ startDate: '2026-09-10', endDate: '2026-09-10', pageSize: 2, page: 2 }, [3, 2]],
      [{}, [5, 4, 6, 3, 2, 1]]
    ]) {
      const query = { pageSize: 10, ...filter };
      let status, online;
      await MapGameController.getAll({ query }, { status(code) { status = code; return this; }, json(value) { online = value; } });
      assert.equal(status, 200);
      assert.deepEqual(online.map(row => row.id), ids);
      const offline = await readStaticData(async name => name === 'collections.mapGames' ? rows : [], '/map-games', query);
      assert.deepEqual(offline, online);
    }
  } finally { MapGame.findAll = original; }
});

test('invalid or reversed date ranges fail consistently before querying', async () => {
  const { readStaticData } = await import('../../src/services/staticSnapshot.mjs');
  const originalFind = MapGame.findAll, originalError = console.error;
  MapGame.findAll = async () => { throw new Error('Must not query'); };
  console.error = () => {};
  try {
    for (const query of [{ endDate: '2026-02-30' }, { startDate: 'bad' }, { startDate: '2026-09-11', endDate: '2026-09-10' }]) {
      let status;
      await MapGameController.getAll({ query }, { status(code) { status = code; return this; }, json() {} });
      assert.equal(status, 400);
      await assert.rejects(readStaticData(async () => [], '/map-games', query), error => error.response.status === 400);
    }
  } finally { MapGame.findAll = originalFind; console.error = originalError; }
});
