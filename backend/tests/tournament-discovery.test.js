const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cheerio = require('cheerio');
const { loadTournamentSnapshot } = require('../services/TournamentSnapshotLoader');
const { parseTournamentHtml } = require('../services/LiquipediaTournamentParser');
const { parseTournamentUrl } = require('../services/LiquipediaRosterParser');
const { bindTournament } = require('../services/TournamentMatchMatcher');
const fixture = cheerio.load(fs.readFileSync(`${__dirname}/fixtures/tournaments/emea2.html`, 'utf8'));
const table = fixture('.group-table').first().toString();
const source = parseTournamentUrl('https://liquipedia.net/overwatch/Example/2026');
const link = (path, text = 'Detailed results') => `<a href="/overwatch/Example/2026/${path}">${text}</a>`;
const regular = `<h2>Results</h2><h3>Regular Season</h3>${table}`;
const load = async (pages, options = {}) => {
  const calls = [];
  const result = await loadTournamentSnapshot(source, { fetchCanonicalPages: async () => ({}),
    fetchPage: async ({ page }) => { calls.push(page); assert.ok(pages[page], `Unexpected fetch ${page}`); return typeof pages[page] === 'string' ? { html: pages[page] } : pages[page]; }, ...options });
  return { result, calls };
};

test('same-level qualifier navigation and participants references do not enter regular season', async () => {
  const { result, calls } = await load({
    [source.page]: `<nav>${link('Open_Qualifier', 'Open Qualifier')}${link('Regular_Season#Matches', 'Regular Season')}</nav>${regular}<h2>Participants</h2>${link('Open_Qualifier', 'Open Qualifier')}`,
    [`${source.page}/Regular Season`]: regular + `<nav>${link('Relegation', 'Promotion/Relegation')}${link('Open_Qualifier', 'Open Qualifier')}</nav>`
  });
  assert.deepEqual(calls, [source.page, `${source.page}/Regular Season`]);
  assert.ok(result.blocks.every(block => block.stageId === 'regular-season'));
  assert.ok(result.discovery.diagnostics.some(d => d.reason === 'outside-requested-stages'));
});

test('explicit detailed-results edge can discover a nonstandard child and its nested schedule', async () => {
  const { result, calls } = await load({
    [source.page]: regular + link('Schedule#Matches'),
    [`${source.page}/Schedule`]: '<h2>Results</h2><h3>Regular Season</h3><p>Detailed results are split across the following pages for this phase of the event.</p>' + link('Schedule/Week_1'),
    [`${source.page}/Schedule/Week 1`]: regular
  });
  assert.equal(calls.length, 3);
  assert.equal(result.sources[2].discoveredFrom.stage, 'regular-season');
  assert.equal(result.blocks.length, 1);
});

test('landing page may have navigation but no standings, and page/depth limits are explicit', async () => {
  const pages = { [source.page]: '<p>This event landing page links to its regular season results and detailed match schedule.</p><nav>' + link('Regular_Season', 'Regular Season') + '</nav>',
    [`${source.page}/Regular Season`]: regular + link('Regular_Season/Matches'),
    [`${source.page}/Regular Season/Matches`]: regular };
  assert.equal((await load(pages)).calls.length, 3);
  const limited = await load(pages, { maxPages: 2 });
  assert.equal(limited.calls.length, 2);
  assert.equal(limited.result.discovery.complete, false);
  assert.ok(limited.result.discovery.diagnostics.some(d => d.reason === 'page-limit'));
  assert.equal((await load(pages, { maxDepth: 1 })).result.discovery.complete, false);
});

test('phase identity prevents identical standings from being deduplicated across phases', async () => {
  const html = regular + `<h3>Playoffs Seeding Decider Matches</h3>${table}`;
  assert.equal(parseTournamentHtml({ html, page: source.page }).blocks.length, 2);
  const { result } = await load({ [source.page]: html });
  assert.deepEqual(result.blocks.map(b => b.stageId), ['regular-season', 'playoff-seeding']);
});

test('explicit qualifier phase remains separate and references alone cannot discover a schedule', async () => {
  const { result, calls } = await load({ [source.page]: regular + `<h3>Open Qualifier</h3>${table}${link('Open_Qualifier', 'Matches')}<h2>Participants</h2>${link('Regular_Season', 'Regular Season')}`,
    [`${source.page}/Open Qualifier`]: '<h2>Results</h2><h3>Group Stage</h3>' + table });
  assert.equal(calls.length, 2);
  assert.deepEqual(result.blocks.map(b => b.stageId), ['regular-season', 'open-qualifier']);
});

test('child cannot redirect outside the selected competition or contradict its referring phase', async () => {
  await assert.rejects(load({ [source.page]: regular + link('Schedule'),
    [`${source.page}/Schedule`]: { title: 'Other/2026/Regular Season', html: regular } }), /其他赛事/);
  const { result } = await load({ [source.page]: regular + link('Schedule'),
    [`${source.page}/Schedule`]: '<h2>Results</h2><h3>Playoffs</h3>' + table });
  assert.equal(result.blocks[1].stageIssue, 'stage-conflict');
  assert.equal(result.blocks[1].stageId, 'other');
});

test('a detailed group link cannot override an explicit different group on its target page', async () => {
  const { result } = await load({ [source.page]: `<h2>Results</h2><h3>Group Stage</h3><h4>Group A</h4>${table}${link('Schedule')}`,
    [`${source.page}/Schedule`]: `<h2>Results</h2><h3>Group Stage</h3><h4>Group B</h4>${table}` });
  assert.equal(result.blocks[1].stageIssue, 'group-conflict');
  assert.equal(result.blocks[1].groupKey, 'group b');
  assert.equal(result.blocks[1].stageId, 'other');
});

test('duplicate source disagreements and simultaneous cross-phase games cannot gain local links', () => {
  const teams = [{ id: 1, name: 'A', liquipediaUrl: 'https://liquipedia.net/overwatch/A' }, { id: 2, name: 'B', liquipediaUrl: 'https://liquipedia.net/overwatch/B' }];
  const game = scores => ({ timestamp: Date.parse('2026-06-06T12:00:00Z'), opponents: teams.map((team, i) => ({ name: team.name, url: team.liquipediaUrl, score: scores[i] })) });
  const catalog = { teams, seasonId: 1, matches: [{ id: 99, seasonId: 1, team1Id: 1, team2Id: 2, matchDate: '2026-06-06', team1Score: 3, team2Score: 1 }] };
  const conflict = bindTournament({ blocks: [{ type: 'matches', matches: [game([3, 1]), game([0, 3])] }] }, catalog);
  assert.ok(conflict.blocks[0].matches.every(match => !match.matchId && match.sourceConflict));
  const distinct = bindTournament({ blocks: ['regular-season', 'open-qualifier'].map(stageId => ({ type: 'matches', stageId, matches: [game([3, 1])] })) }, catalog);
  assert.ok(distinct.blocks.every(block => !block.matches[0].matchId));
});
