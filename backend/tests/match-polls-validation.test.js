const test = require('node:test');
const assert = require('node:assert/strict');
const Season = require('../models/Season');
const Config = require('../models/Config');
const Team = require('../models/Team');
const TeamAlias = require('../models/TeamAlias');
const { VoteVisitor } = require('../models/MatchVote');
const upcoming = require('../services/UpcomingMatchesService');
const { castVote } = require('../services/MatchPollService');

const setup = t => {
  const source = { sourceId: 'overwatch:group_R01-M001', sourcePage: 'Test Event', sourceGroup: 'group',
    timestamp: Date.now() + 3600000, team1: { name: 'A' }, team2: { name: 'B' } };
  const result = { data: [source], stale: false };
  t.mock.method(Season, 'findByPk', async () => ({ id: 1 }));
  t.mock.method(Config, 'findByPk', async () => ({ value: { liquipediaTournamentUrl: 'https://liquipedia.net/overwatch/Test_Event' } }));
  t.mock.method(Team, 'findAll', async () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }]);
  t.mock.method(TeamAlias, 'findAll', async () => []);
  t.mock.method(VoteVisitor, 'findByPk', async () => ({}));
  t.mock.method(upcoming, 'getUpcomingMatches', async () => result);
  return { source, result, body: { seasonId: 1, sourceId: source.sourceId, teamId: 1, team1Id: 1, team2Id: 2 }, token: 'a'.repeat(64) };
};

test('stale source data cannot authorize voting', async t => {
  const { body, token, result } = setup(t); result.stale = true;
  await assert.rejects(castVote(body, token), { statusCode: 503 });
});
test('removed source, changed pair, foreign team and kickoff reject before any write', async t => {
  const { body, token, source } = setup(t);
  await assert.rejects(castVote({ ...body, sourceId: 'unknown' }, token), { statusCode: 409 });
  await assert.rejects(castVote({ ...body, team2Id: 3 }, token), { statusCode: 409 });
  await assert.rejects(castVote({ ...body, teamId: 3 }, token), { statusCode: 400 });
  source.timestamp = Date.now() - 1;
  await assert.rejects(castVote(body, token), { statusCode: 409 });
});
test('unknown identity and a source from another season cannot vote', async t => {
  const { body, token, source } = setup(t);
  await assert.rejects(castVote(body, 'invented'), { statusCode: 401 });
  source.sourcePage = 'Other Event';
  await assert.rejects(castVote(body, token), { statusCode: 409 });
});
