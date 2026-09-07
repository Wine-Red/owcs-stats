const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseTournamentUrl, parseRosterHtml } = require('../services/LiquipediaRosterParser');
const { matchRoster } = require('../services/LiquipediaRosterMatcher');
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/liquipedia-roster', `${name}.html`), 'utf8');
const player = (name, link = name) => ({ name, link: `https://liquipedia.net/overwatch/${link}` });
const team = (name, players = [], extra = {}) => ({ name, link: `https://liquipedia.net/overwatch/${name}`, shortNames: [name], players, warnings: [], ...extra });
const roster = teams => ({ teams, warnings: [] });
const catalog = { teams: [{ id: 1, name: 'WBG' }, { id: 2, name: 'JDG' }], players: [{ id: 1, name: 'LEAVE' }, { id: 2, name: 'Shy' }] };

test('only validated Overwatch titles are accepted, including encoded and index.php links', () => {
  const expected = parseTournamentUrl('https://liquipedia.net/overwatch/Overwatch_World_Cup/2026#Participants');
  assert.equal(expected.page, 'Overwatch World Cup/2026');
  assert.deepEqual(parseTournamentUrl('http://www.liquipedia.net/overwatch/index.php?title=Overwatch_World_Cup%2F2026'), expected);
  for (const value of ['https://evil.com/overwatch/a', 'https://liquipedia.net.evil.com/overwatch/a', 'https://liquipedia.net/dota2/a', 'file:///overwatch/a', 'https://me@liquipedia.net/overwatch/a', 'https://liquipedia.net:444/overwatch/a', 'https://liquipedia.net/overwatch/Template:Team', 'https://liquipedia.net/overwatch/api.php', '', 'https://liquipedia.net/overwatch/%zz']) {
    assert.throws(() => parseTournamentUrl(value), { statusCode: 400 }, value);
  }
});

test('real China tournament fixture joins short names by link and uses displayed player ID, not real-name page title', () => {
  const parsed = parseRosterHtml(fixture('season'));
  assert.equal(parsed.teams.length, 9);
  const wbg = parsed.teams[0];
  assert.deepEqual(wbg.shortNames, ['WBG']);
  assert.deepEqual(wbg.players.map(p => p.name), ['Leave', 'Shy', 'Guxue', 'Sunzo', 'LeeSooMin', 'MAKA']);
  assert.ok(wbg.players[0].link.endsWith('/Huang_Xin'));
  assert.equal(wbg.players.some(p => ['Dongsu', 'Daemin', 'Cogito'].includes(p.name)), false);
  assert.ok(parsed.teams.find(t => t.name === 'Solus Victorem').players.some(p => p.name === 'Noy'));
  assert.deepEqual(parsed.teams.find(t => t.name === 'Smash Boom').shortNames, []);
});

test('real World Cup fixture includes all sixteen rosters and bench players without staff', () => {
  const parsed = parseRosterHtml(fixture('world-cup'));
  assert.equal(parsed.teams.length, 16);
  assert.equal(parsed.teams.reduce((count, t) => count + t.players.length, 0), 121);
  assert.equal(parsed.teams.flatMap(t => t.warnings).length, 0);
  assert.deepEqual(parsed.teams.find(t => t.name === 'China').shortNames, ['CHN']);
  assert.deepEqual(parsed.teams.find(t => t.name === 'China').players.map(p => p.name), ['Pineapple', 'Alphari', 'Kaneki', 'Sunzo', 'Lengsa', 'Recall', 'Diya']);
});

test('unknown markup, team homepages and empty responses fail closed', () => {
  for (const html of ['', '<h2>Player Roster</h2><table class="roster-card"></table>', '<h2>Participants</h2><table>WBG Leave</table>', fixture('season').replace('<h2>Participants</h2>', '<h2>Related tournaments</h2>')]) {
    assert.throws(() => parseRosterHtml(html), { statusCode: 422 });
  }
});

test('missing roster yields explicit warning while preserving the participant', () => {
  const html = '<h2>Participants</h2><div class="team-participant-card"><div class="team-participant-card__header"><span class="name"><a href="/overwatch/WBG">WBG</a></span></div></div>';
  const parsed = parseRosterHtml(html);
  assert.equal(parsed.teams[0].players.length, 0);
  assert.match(parsed.teams[0].warnings[0], /未识别到选手阵容/);
});

test('unique case-insensitive exact matching preserves punctuation and never guesses missing identities', () => {
  const result = matchRoster(roster([team(' WBG ', [player(' Leave ', 'Huang_Xin'), player('LEA-VE'), player('NewPlayer')]), team('AG', [player('Shy')])]), catalog);
  assert.equal(result.teams[0].teamId, 1);
  assert.equal(result.teams[0].players[0].playerId, 1);
  assert.equal(result.summary.matchedPlayers, 1);
  assert.equal(result.summary.skippedTeams, 1);
  assert.equal(result.summary.skippedPlayers, 3);
});

test('ambiguous player names and conflicting shortnames never select the first candidate', () => {
  const result = matchRoster(roster([team('WBG', [player('Leave')]), team('JDG', [], { shortNames: ['JDG', 'WBG'] })]), {
    ...catalog, players: [...catalog.players, { id: 3, name: 'Leave' }]
  });
  assert.equal(result.teams[0].players[0].status, 'skipped');
  assert.equal(result.teams[0].players[0].playerId, null);
  assert.equal(result.teams[1].status, 'skipped');
});

test('same-season other-team membership is a conflict; existing same-team records are retained', () => {
  const result = matchRoster(roster([team('WBG', [player('Leave'), player('Shy')])]), {
    ...catalog, seasonTeams: [{ id: 4, teamId: 1 }, { id: 5, teamId: 2 }], seasonPlayers: [{ seasonTeamId: 4, playerId: 1 }, { seasonTeamId: 5, playerId: 2 }]
  });
  assert.equal(result.teams[0].existing, true);
  assert.equal(result.teams[0].players[0].existing, true);
  assert.match(result.teams[0].players[1].reason, /JDG/);
  assert.equal(result.summary.newPlayers, 0);
});

test('source cross-team duplicates reject both sides, even if one source team does not exist', () => {
  const result = matchRoster(roster([team('WBG', [player('Leave')]), team('UnknownTeam', [player('LEAVE', 'Leave')])]), catalog);
  assert.equal(result.summary.matchedPlayers, 0);
  assert.match(result.teams[0].players[0].reason, /多个队伍或身份/);
});

test('two wiki identities with one display name, or one wiki identity with two database names, are ambiguous', () => {
  const first = matchRoster(roster([team('WBG', [player('Leave', 'Huang_Xin'), player('Leave', 'Another_Person')])]), catalog);
  assert.equal(first.summary.matchedPlayers, 0);
  const second = matchRoster(roster([team('WBG', [player('Leave', 'Huang_Xin'), player('Shy', 'Huang_Xin')])]), catalog);
  assert.equal(second.summary.matchedPlayers, 0);
});

test('two different source teams resolving to one database team are both skipped', () => {
  const result = matchRoster(roster([team('WBG', [player('Leave')]), team('Weibo', [player('Shy')], { shortNames: ['WBG'] })]), catalog);
  assert.equal(result.summary.matchedTeams, 0);
  assert.equal(result.summary.matchedPlayers, 0);
});

test('explicit role conflicts are skipped while Flex does not force a position', () => {
  const players = [{ ...player('Leave'), role: 'Support' }, { ...player('Shy'), role: 'Flex' }];
  const result = matchRoster(roster([team('WBG', players)]), { ...catalog, players: catalog.players.map(p => ({ ...p, role: 'damage' })) });
  assert.match(result.teams[0].players[0].reason, /选手位置不一致/);
  assert.equal(result.teams[0].players[1].status, 'matched');
});
