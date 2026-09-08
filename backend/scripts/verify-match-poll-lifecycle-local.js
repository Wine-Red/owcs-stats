// Local-only rehearsal: fixture source/client, real vote service, importer and DB.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const db = require('../config/database');
const Season = require('../models/Season');
const Team = require('../models/Team');
const Config = require('../models/Config');
const Match = require('../models/Match');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamSource = require('../models/SeasonTeamSource');
const MatchPoll = require('../models/MatchPoll');
const { MatchVote, VoteVisitor } = require('../models/MatchVote');
const upstream = require('../services/UpcomingMatchesService');
const polls = require('../services/MatchPollService');
const { createIncrementalMatchSyncService } = require('../services/IncrementalMatchSyncService');
const { chromium } = require('../../node_modules/playwright-core');
const runId = randomUUID();
const sourcePage = `Verification-${runId}`;
const sourceId = `verification:${runId}`;
const externalId = `poll-lifecycle:${runId}`;
const originalUpcoming = upstream.getUpcomingMatches;
let season, token, browser;

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(db.config.host));
  assert.equal(db.config.database, 'localstats');
  const [identity] = await db.query('SELECT VERSION() version, DATABASE() db, CURRENT_USER() dbUser');
  console.log('Database identity:', identity);
  const teams = await Team.findAll({ order: [['id', 'ASC']], limit: 2 });
  assert.equal(teams.length, 2);
  season = await Season.create({ name: `Poll lifecycle verification ${runId}`, status: 'completed' });
  await Config.create({ key: `visualize_season_${season.id}`, value: { liquipediaTournamentUrl: `https://liquipedia.net/overwatch/${sourcePage}` } });
  const source = { sourceId, sourcePage, sourceGroup: runId, timestamp: Date.now() + 3600000,
    team1: { name: teams[0].name }, team2: { name: teams[1].name } };
  let sourcePresent = true;
  upstream.getUpcomingMatches = async () => ({ data: sourcePresent ? [source] : [], stale: false });
  token = await polls.createVisitor();
  const body = { seasonId: season.id, sourceId, team1Id: teams[0].id, team2Id: teams[1].id, teamId: teams[0].id };
  const voted = await polls.castVote(body, token);
  const pollId = voted.sources[sourceId].pollId;
  assert.equal(voted.sources[sourceId].total, 1);
  assert.equal(await Match.count({ where: { seasonId: season.id } }), 0);
  console.log('1. Vote saved before any formal match exists.');
  source.timestamp = Date.now() - 3600000;
  assert.equal((await polls.getSummary(season.id, token)).sources[sourceId].closed, true);
  await assert.rejects(polls.castVote(body, token), e => e.statusCode === 409);
  sourcePresent = false;
  assert.deepEqual((await polls.getSummary(season.id, token)).sources, {});
  assert.equal(await MatchVote.count({ where: { pollId } }), 1);
  console.log('2. Start closes voting; source disappearance preserves votes.');
  const matchDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(source.timestamp);
  const detail = { id: externalId, eventName: season.name, updatedAt: new Date().toISOString(), matchDate,
    teamA: { name: teams[1].name }, teamB: { name: teams[0].name }, scoreA: 0, scoreB: 3, boFormat: 'BO5', rounds: [] };
  // Isolate the remote client/queue. Keep the production match importer and
  // membership reconciliation running in a real database transaction.
  const sync = createIncrementalMatchSyncService({
    client: { fetchMatch: async () => detail },
    inbox: {
      enqueueOne: async change => ({ externalId: change.id, sourceUpdatedAt: change.updatedAt, operation: change.operation }),
      apply: async (row, apply) => ({ result: await db.transaction(tx => apply(row, tx)) })
    }
  });
  await sync.syncMatch(externalId);
  const imported = await Match.findOne({ where: { externalId } });
  assert.ok(imported);
  assert.equal(imported.team1Id, teams[1].id);
  await polls.reconcilePolls(season.id);
  const summary = await polls.getSummary(season.id, token);
  assert.equal(summary.matches[imported.id].pollId, pollId);
  assert.equal(summary.matches[imported.id].votes[teams[0].id], 1);
  assert.equal(summary.matches[imported.id].closed, true);
  await sync.syncMatch(externalId);
  await polls.reconcilePolls(season.id);
  assert.equal(await Match.count({ where: { externalId } }), 1);
  assert.equal(await MatchVote.count({ where: { pollId } }), 1);
  sourcePresent = true;
  source.timestamp = Date.now() + 3600000;
  await assert.rejects(polls.castVote(body, token), e => e.statusCode === 409);
  console.log('3. Import links reversed teams correctly; repeated sync is idempotent; linked poll cannot reopen.');
  upstream.getUpcomingMatches = originalUpcoming;
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://127.0.0.1:8180/visualize?seasonId=${season.id}&tab=recent`, { waitUntil: 'networkidle' });
  await page.locator('.schedule-match').first().waitFor();
  assert.equal(await page.locator('.schedule-match .match-support').count(), 0);
  await page.locator('.match-main').first().click();
  await page.locator('.match-detail-page .match-hero').waitFor();
  assert.equal(await page.locator('.match-support').count(), 0);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.match-detail-page .match-hero').waitFor();
  assert.equal(await page.locator('.match-support').count(), 0);
  console.log('4. Finished list and detail hide support; linked votes remain stored.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  upstream.getUpcomingMatches = originalUpcoming;
  if (browser) await browser.close();
  if (season) {
    const entries = await MatchPoll.findAll({ where: { seasonId: season.id }, attributes: ['id'] });
    for (const p of entries) await MatchVote.destroy({ where: { pollId: p.id } });
    await MatchPoll.destroy({ where: { seasonId: season.id } });
    await Match.destroy({ where: { seasonId: season.id, externalId } });
    const memberships = await SeasonTeam.findAll({ where: { seasonId: season.id }, attributes: ['id'] });
    for (const m of memberships) await SeasonTeamSource.destroy({ where: { seasonTeamId: m.id } });
    await SeasonTeam.destroy({ where: { seasonId: season.id } });
    await Config.destroy({ where: { key: `visualize_season_${season.id}` } });
    await Season.destroy({ where: { id: season.id } });
    assert.equal(await Match.count({ where: { externalId } }), 0);
    assert.equal(await MatchPoll.count({ where: { sourceId } }), 0);
  }
  if (token) await VoteVisitor.destroy({ where: { tokenHash: polls.hashToken(token) } });
  await db.close();
  console.log('Verification fixtures cleaned.');
});
