const test = require('node:test');
const assert = require('node:assert/strict');
const Season = require('../models/Season');
const Config = require('../models/Config');
const Team = require('../models/Team');
const TeamAlias = require('../models/TeamAlias');
const { VoteVisitor } = require('../models/MatchVote');
const upcoming = require('../services/UpcomingMatchesService');
const { castVote, getContext, reconcilePolls } = require('../services/MatchPollService');
const { getTournamentService } = require('../services/TournamentRuntime');
const MatchPoll = require('../models/MatchPoll');
const Match = require('../models/Match');

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
  t.mock.method(getTournamentService(), 'readSaved', async () => null);
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

test('voting accepts discovered phase pages for automatic sources, but not arbitrary descendants or old snapshots', async t => {
  const { source } = setup(t);
  const root = 'Overwatch Champions Series/2026/Asia/Stage 3/Korea';
  const url = 'https://liquipedia.net/overwatch/' + root.replaceAll(' ', '_');
  t.mock.method(Season, 'findByPk', async () => ({ id: 1, name: '2026 OWCS 韩国赛区第三阶段' }));
  t.mock.method(Config, 'findByPk', async () => ({ value: {} }));
  let saved = { page: root, blocks: [{ sourceUrl: url + '/Regular_Season', sourceTitle: 'Regular Season' }],
    sources: [{ url }, { url: url + '/Regular_Season' }] };
  t.mock.method(getTournamentService(), 'readSaved', async page => { assert.equal(page, root); return saved; });
  source.sourcePage = root + '/Regular Season';
  assert.equal((await getContext(1)).sources.length, 1);
  source.sourcePage = root + '/Open Qualifier';
  assert.equal((await getContext(1)).sources.length, 0);
  source.sourcePage = root + '/Regular Season';
  saved = { ...saved, page: 'Other Event' };
  assert.equal((await getContext(1)).sources.length, 0);
  saved = { ...saved, page: root, blocks: [{ ...saved.blocks[0], stageIssue: 'stage-conflict' }] };
  assert.equal((await getContext(1)).sources.length, 0);
  source.sourcePage = root;
  assert.equal((await getContext(1)).sources.length, 1, 'exact configured page remains supported without a child snapshot');
});

test('child-page votes reconcile across seasons sharing an automatic source', async t => {
  const root = 'Overwatch World Cup/2026', child = root + '/Group Stage';
  t.mock.method(MatchPoll, 'findAll', async () => [{ id: 1, seasonId: 24, sourcePage: child,
    pairKey: '1:2', scheduledAt: '2026-09-12T19:00:00Z', matchId: null }]);
  t.mock.method(Config, 'findAll', async () => []);
  t.mock.method(Season, 'findAll', async () => [
    { id: 24, name: '2026 守望先锋世界杯 小组赛' }, { id: 25, name: '2026 守望先锋世界杯 季后赛' }
  ]);
  t.mock.method(Match, 'findAll', async () => [{ id: 99, seasonId: 25, team1Id: 1, team2Id: 2, matchDate: '2026-09-13' }]);
  const updates = [];
  t.mock.method(MatchPoll, 'update', async (value, options) => { updates.push({ value, where: options.where }); });
  await reconcilePolls(25, { sourcePage: root, sourcePages: [root, child] });
  assert.deepEqual(updates, [{ value: { matchId: 99 }, where: { id: 1, matchId: null } }]);
});
