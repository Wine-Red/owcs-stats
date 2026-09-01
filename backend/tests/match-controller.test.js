const test = require('node:test');
const assert = require('node:assert/strict');
const MatchController = require('../controllers/MatchController');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const Map = require('../models/Map');
const Team = require('../models/Team');
const Hero = require('../models/Hero');
const MapGameTimeline = require('../models/MapGameTimeline');

test('match map list exposes timeline metadata without the heavy payload', async () => {
  const originalMatchFindByPk = Match.findByPk;
  const originalMapGameFindAll = MapGame.findAll;
  let capturedOptions = null;

  Match.findByPk = async () => ({ id: 5445 });
  MapGame.findAll = async (options) => {
    capturedOptions = options;
    return [{ id: 27301, timeline: { revision: 1 } }];
  };

  const response = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; }
  };

  try {
    await MatchController.getMapGames({ params: { id: '5445' } }, response);
  } finally {
    Match.findByPk = originalMatchFindByPk;
    MapGame.findAll = originalMapGameFindAll;
  }

  assert.equal(response.statusCode, 200);
  assert.deepEqual(capturedOptions.include, [
    { model: Team, as: 'winner' },
    { model: Map },
    { model: Hero, as: 'team1BanHero' },
    { model: Hero, as: 'team2BanHero' },
    {
      model: MapGameTimeline,
      as: 'timeline',
      attributes: { exclude: ['payload'] }
    }
  ]);
  assert.equal(response.payload[0].timeline.revision, 1);
});
