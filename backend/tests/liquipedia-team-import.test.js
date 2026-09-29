const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseParticipantTeamsHtml } = require('../services/LiquipediaRosterParser');
const { matchTeamsByPage } = require('../services/LiquipediaTeamMatcher');
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/liquipedia-roster', `${name}.html`), 'utf8');

test('participant-only extraction needs team cards, not player roster', () => {
  const world = parseParticipantTeamsHtml(fixture('world-cup'));
  assert.equal(world.teams.length, 16);
  assert.equal(world.teams.find(team => team.name === 'Saudi Arabia').link, 'https://liquipedia.net/overwatch/Saudi_Arabia');
  const noRoster = parseParticipantTeamsHtml('<h2>Participants</h2><div class="team-participant-card"><div class="team-participant-card__header"><span class="name"><a href="/overwatch/Weibo_Gaming">WBG</a></span></div></div>');
  assert.deepEqual(noRoster.teams.map(team => team.name), ['WBG']);
  assert.throws(() => parseParticipantTeamsHtml('<h2>Participants</h2><p>Coming soon</p>'), { statusCode: 422 });
});

test('exact canonical pages match confirmed bindings; names and missing pages do not', () => {
  const sourceTeams = parseParticipantTeamsHtml(fixture('world-cup')).teams;
  const report = matchTeamsByPage({ sourceTeams,
    teams: [
      { id: 10, name: 'SAU', liquipediaUrl: 'https://liquipedia.net/overwatch/Team_Saudi_Arabia' },
      { id: 11, name: 'Saudi Arabia' },
      { id: 12, name: 'CHN', liquipediaUrls: ['https://liquipedia.net/overwatch/Team_China'] }
    ], redirects: { 'Saudi Arabia': 'Team Saudi Arabia', China: 'Team China' },
    seasonTeams: [{ teamId: 12 }] });
  assert.equal(report.teams.find(team => team.name === 'Saudi Arabia').teamId, 10);
  assert.equal(report.teams.find(team => team.name === 'China').teamId, 12);
  assert.equal(report.teams.find(team => team.name === 'China').existing, true);
  assert.equal(report.summary.matchedTeams, 2);
  assert.equal(report.summary.skippedTeams, 14);
  const duplicate = matchTeamsByPage({ sourceTeams: sourceTeams.slice(0, 1),
    teams: [{ id: 10, name: 'SAU', liquipediaUrl: 'https://liquipedia.net/overwatch/Team_Saudi_Arabia' },
      { id: 13, name: 'Other', liquipediaUrl: 'https://liquipedia.net/overwatch/Saudi_Arabia' }],
    redirects: { 'Saudi Arabia': 'Team Saudi Arabia' } });
  assert.equal(duplicate.teams[0].status, 'skipped');
  assert.match(duplicate.teams[0].reason, /多个本地队伍/);
  const twoPagesOneTeam = matchTeamsByPage({
    sourceTeams: sourceTeams.slice(0, 2),
    teams: [{ id: 10, name: 'SAU', liquipediaUrls: [
      'https://liquipedia.net/overwatch/Saudi_Arabia',
      'https://liquipedia.net/overwatch/China'
    ] }]
  });
  assert.equal(twoPagesOneTeam.summary.matchedTeams, 0);
  assert.equal(twoPagesOneTeam.summary.skippedTeams, 2);
  assert.match(twoPagesOneTeam.teams[0].reason, /多个不同页面/);
});
