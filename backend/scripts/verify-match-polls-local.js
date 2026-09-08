// Run from backend/ against an already running local backend and Vite preview.
// Creates isolated votes, exercises real MySQL concurrency + browser flows,
// then removes only this run's votes/visitors and its empty poll records.
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const { mkdir } = require('fs/promises');
const path = require('path');
const { chromium } = require('../../node_modules/playwright-core');
const db = require('../config/database');
const MatchPoll = require('../models/MatchPoll');
const { MatchVote, VoteVisitor } = require('../models/MatchVote');
const { hashToken } = require('../services/MatchPollService');

const base = process.env.POLL_VERIFY_API || 'http://127.0.0.1:3100';
const frontend = process.env.POLL_VERIFY_FRONTEND || 'http://127.0.0.1:8180';
const output = process.env.POLL_VERIFY_OUTPUT || path.resolve(__dirname, '../../.local/poll-preview');
const tokens = []; const createdPollIds = new Set();
let browser;
const request = async (url, token, body) => {
  const res = await fetch(`${base}${url}`, { method: body ? 'POST' : 'GET',
    headers: { ...(token ? { 'X-Vote-Token': token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  return data;
};

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(db.config.host), 'Only a local database is permitted');
  assert.equal(db.config.database, 'localstats', 'Only localstats is permitted');
  assert.equal(new URL(base).hostname, '127.0.0.1');
  const [identity] = await db.query('SELECT VERSION() version, DATABASE() db, CURRENT_USER() dbUser');
  console.log('Database identity:', JSON.stringify(identity));
  await mkdir(output, { recursive: true });
  const existingPolls = new Set((await MatchPoll.findAll({ attributes: ['id'], raw: true })).map(p => p.id));
  const seasons = await request('/api/seasons');
  let season; let initial;
  for (const s of seasons.filter(s => s.status === 'in_progress')) {
    const data = await request(`/poll-api/summary?seasonId=${s.id}`);
    if (Object.values(data.sources).some(p => !p.closed)) { season = s; initial = data; break; }
  }
  assert.ok(season, 'No current identifiable fixture for the local database');
  const source = Object.values(initial.sources).find(p => !p.closed && !p.pollId) || Object.values(initial.sources).find(p => !p.closed);
  const url = `/poll-api/summary?seasonId=${season.id}`;
  const body = { seasonId: season.id, sourceId: source.sourceId,
    team1Id: source.team1Id, team2Id: source.team2Id, teamId: source.team1Id };
  for (let i = 0; i < 2; i++) tokens.push((await request('/poll-api/visitor', null, {})).token);
  // Eight simultaneous writes by the same anonymous identity must count once.
  const concurrent = await Promise.allSettled(Array.from({ length: 8 }, () => request('/poll-api/vote', tokens[0], body)));
  let summary = await request(url, tokens[0]);
  let voted = summary.sources[source.sourceId];
  if (!existingPolls.has(voted.pollId)) createdPollIds.add(voted.pollId);
  for (const result of concurrent) assert.equal(result.status, 'fulfilled', String(result.reason || ''));
  assert.equal(voted.total, source.total + 1);
  assert.equal(voted.myTeamId, source.team1Id);
  await request('/poll-api/vote', tokens[1], { ...body, teamId: source.team2Id });
  await request('/poll-api/vote', tokens[0], { ...body, teamId: source.team2Id });
  voted = (await request(url, tokens[0])).sources[source.sourceId];
  assert.equal(voted.total, source.total + 2);
  assert.equal(voted.votes[source.team2Id], (source.votes[source.team2Id] || 0) + 2);
  assert.equal(voted.myTeamId, source.team2Id);
  console.log('Real API: concurrent retries, second visitor and changed selection passed');

  const teams = await request('/api/teams');
  const team1 = teams.find(t => t.id === source.team1Id); const team2 = teams.find(t => t.id === source.team2Id);
  const query = new URLSearchParams({ seasonId: season.id, sourceId: source.sourceId,
    t1: team1.name, t2: team2.name, time: source.timestamp, tournament: season.name });
  browser = await chromium.launch({ executablePath: process.env.POLL_VERIFY_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const freshToken = (await request('/poll-api/visitor', null, {})).token;
  tokens.push(freshToken);
  const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await freshContext.addInitScript(token => localStorage.setItem('owcs_vote_visitor_v1', token), freshToken);
  const freshPage = await freshContext.newPage();
  await freshPage.goto(`${frontend}/visualize/upcoming-match?${query}`, { waitUntil: 'networkidle' });
  await freshPage.locator('.support-choice').first().waitFor();
  assert.equal(await freshPage.locator('.support-percent').count(), 0);
  assert.equal(await freshPage.locator('.match-support.concealed').count(), 1);
  await freshPage.getByRole('button', { name: `支持 ${team1.name}`, exact: true }).click();
  await freshPage.getByRole('button', { name: `已支持 ${team1.name}`, exact: true }).waitFor();
  assert.equal(await freshPage.locator('.support-percent').count(), 2);
  assert.equal(await freshPage.locator('.match-support.concealed').count(), 0);
  assert.match(await freshPage.locator('.support-fill').first().evaluate(el => getComputedStyle(el).transitionProperty), /clip-path/);
  await freshPage.reload({ waitUntil: 'networkidle' });
  assert.equal(await freshPage.locator('.support-percent').count(), 2);
  await freshContext.close();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(token => localStorage.setItem('owcs_vote_visitor_v1', token), tokens[0]);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${frontend}/visualize/upcoming-match?${query}`, { waitUntil: 'networkidle' });
  const support = page.locator('.match-support');
  await support.getByRole('button', { name: `已支持 ${team2.name}`, exact: true }).waitFor();
  assert.equal(await page.locator('.match-banner .match-support').count(), 1);
  assert.doesNotMatch(await support.innerText(), /你支持谁|每个匿名身份|开赛前|已记录|票/);
  await support.getByRole('button', { name: `支持 ${team1.name}`, exact: true }).click();
  await support.getByRole('button', { name: `已支持 ${team1.name}`, exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await support.getByRole('button', { name: `已支持 ${team1.name}`, exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, 'vote-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(output, 'vote-desktop.png'), fullPage: true });
  await page.goto(`${frontend}/visualize?seasonId=${season.id}`, { waitUntil: 'networkidle' });
  const schedule = page.locator('.schedule-match').filter({ hasText: team1.name }).filter({ hasText: team2.name });
  await schedule.first().locator('.match-support').waitFor();
  assert.equal(await schedule.first().locator('.match-main .match-support').count(), 0);
  assert.doesNotMatch(await schedule.first().locator('.match-support').innerText(), /票/);
  assert.equal(await schedule.first().locator('.support-percent').count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await schedule.first().scrollIntoViewIfNeeded();
  const scheduleURL = page.url();
  await schedule.first().getByRole('button', { name: `支持 ${team2.name}`, exact: true }).click();
  await schedule.first().getByRole('button', { name: `已支持 ${team2.name}`, exact: true }).waitFor();
  assert.equal(page.url(), scheduleURL, 'Voting must not navigate to the match');
  await page.reload({ waitUntil: 'networkidle' });
  await schedule.first().getByRole('button', { name: `已支持 ${team2.name}`, exact: true }).waitFor();
  await schedule.first().getByRole('button', { name: `支持 ${team1.name}`, exact: true }).click();
  await schedule.first().getByRole('button', { name: `已支持 ${team1.name}`, exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'schedule-mobile.png') });

  // A synthetic poll references a real historical matchup, without modifying
  // its formal record or importing fabricated match data.
  const response = await request(`/api/matches?seasonId=${season.id}&pageSize=2000`);
  const matches = response.list || response.rows || response.data || response;
  const historical = matches.find(m => !summary.matches[m.id] && matches.filter(other =>
    other.matchDate === m.matchDate && [other.team1Id, other.team2Id].sort().join(':') === [m.team1Id, m.team2Id].sort().join(':')).length === 1);
  assert.ok(historical, 'No unambiguous historical matchup for association verification');
  const poll = await MatchPoll.create({ sourceId: `verification:${randomUUID()}`, sourcePage: 'Verification only', sourceGroup: 'verification',
    seasonId: season.id, team1Id: historical.team2Id, team2Id: historical.team1Id,
    pairKey: [historical.team1Id, historical.team2Id].sort((a, b) => a - b).join(':'),
    scheduledAt: new Date(`${historical.matchDate}T12:00:00+08:00`) });
  createdPollIds.add(poll.id);
  await MatchVote.create({ pollId: poll.id, voterHash: hashToken(tokens[0]), teamId: historical.team1Id });
  summary = await request(url, tokens[0]);
  assert.equal(summary.matches[historical.id]?.pollId, poll.id);
  await page.goto(`${frontend}/visualize/match-detail?matchId=${historical.id}&seasonId=${season.id}`, { waitUntil: 'networkidle' });
  await page.locator('.match-detail-page').waitFor();
  // Hash navigation does not reload modules. Refresh after externally inserting
  // the verification poll so this check uses a new live support summary.
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.match-detail-page .match-support').count(), 0);
  await page.screenshot({ path: path.join(output, 'match-detail-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('Browser: vote, change, reload persistence, schedule totals and linked match detail passed');
  console.log('Screenshots:', output);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (tokens.length) {
    const hashes = tokens.map(hashToken);
    const votes = await MatchVote.findAll({ where: { voterHash: hashes }, raw: true });
    await MatchVote.destroy({ where: { voterHash: hashes } });
    await VoteVisitor.destroy({ where: { tokenHash: hashes } });
    for (const id of new Set([...createdPollIds, ...votes.map(v => v.pollId)])) {
      // Only remove this run's known newly-created records, and only when empty.
      if (createdPollIds.has(id) && !await MatchVote.count({ where: { pollId: id } })) await MatchPoll.destroy({ where: { id } });
    }
  }
  await db.close();
});
