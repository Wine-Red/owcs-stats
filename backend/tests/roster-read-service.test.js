const test = require('node:test');
const assert = require('node:assert/strict');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeamSource = require('../models/SeasonTeamSource');
const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource');
const RosterReadService = require('../services/RosterReadService');
const SeasonStageService = require('../services/SeasonStageService');

test('roster reads keep public associations and only active source types within the caller transaction', async t => {
  const originals = [];
  const replace = (model, method, handler) => { originals.push([model, method, model[method]]); model[method] = handler; };
  t.after(() => originals.forEach(([model, method, handler]) => { model[method] = handler; }));
  const transaction = { id: 'snapshot' };
  const team = { id: 1, seasonId: 2, teamId: 3, players: [{ id: 5 }], futurePublicField: 'kept' };
  const member = { id: 5, seasonTeamId: 1, playerId: 7, SeasonTeam: { id: 1, seasonId: 2, teamId: 3 }, Player: { id: 7 } };
  const wrap = row => ({ ...row, toJSON: () => row });
  replace(SeasonTeam, 'findAll', async options => {
    assert.equal(options.transaction, transaction);
    assert.ok(options.include.some(item => item.as === 'players'));
    return [wrap(team)];
  });
  replace(SeasonTeamPlayer, 'findAll', async options => {
    assert.equal(options.transaction, transaction);
    assert.ok(options.include.some(item => item.model === SeasonTeam));
    assert.deepEqual(options.where, { seasonTeamId: 1 });
    return [wrap(member)];
  });
  replace(SeasonTeamSource, 'findAll', async options => {
    assert.equal(options.transaction, transaction);
    assert.equal(options.where.active, true);
    assert.deepEqual(options.attributes, ['seasonTeamId', 'sourceType']);
    return [{ seasonTeamId: 1, sourceType: 'match', secret: 'never expose' }, { seasonTeamId: 1, sourceType: 'manual' }, { seasonTeamId: 1, sourceType: 'manual' }];
  });
  replace(SeasonTeamPlayerSource, 'findAll', async options => {
    assert.equal(options.transaction, transaction);
    assert.equal(options.where.active, true);
    assert.deepEqual(options.attributes, ['seasonTeamPlayerId', 'sourceType']);
    return [{ seasonTeamPlayerId: 5, sourceType: 'liquipedia', sourceUrl: 'not part of the public DTO' }];
  });
  assert.deepEqual(await RosterReadService.getSeasonTeams({ transaction }), [
    { ...team, sources: [{ sourceType: 'manual' }, { sourceType: 'match' }] }
  ]);
  assert.deepEqual(await RosterReadService.getSeasonTeamPlayers({ seasonTeamId: 1, transaction }), [
    { ...member, sources: [{ sourceType: 'liquipedia' }] }
  ]);
  replace(SeasonTeam, 'findByPk', async () => null);
  replace(SeasonTeamPlayer, 'findByPk', async () => null);
  assert.equal(await RosterReadService.getSeasonTeams({ id: 404, transaction }), null);
  assert.equal(await RosterReadService.getSeasonTeamPlayers({ id: 404, transaction }), null);
});

test('shared stage serialization preserves boundaries and omits internal calculation fields', () => {
  const range = { id: 3, seasonId: 1, name: 'Final', startMatchId: 7, startMatch: { id: 7 }, endMatch: { id: 8 },
    matchCount: 2, isCurrent: true, createdAt: null, updatedAt: null, matchIds: [7, 8], startIndex: 4 };
  assert.deepEqual(SeasonStageService.serializeStageRange(range), {
    id: 3, seasonId: 1, name: 'Final', startMatchId: 7, startMatch: { id: 7 }, endMatchId: 8, endMatch: { id: 8 },
    matchCount: 2, isCurrent: true, createdAt: null, updatedAt: null
  });
  assert.equal(SeasonStageService.serializeStageRange({ ...range, endMatch: null }).endMatchId, null);
  assert.deepEqual(range.matchIds, [7, 8]);
});
