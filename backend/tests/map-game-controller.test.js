const test = require('node:test');
const assert = require('node:assert/strict');
const MapGameController = require('../controllers/MapGameController');
const MapGame = require('../models/MapGame');
const Map = require('../models/Map');
const Team = require('../models/Team');
const MapGameTimeline = require('../models/MapGameTimeline');

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
