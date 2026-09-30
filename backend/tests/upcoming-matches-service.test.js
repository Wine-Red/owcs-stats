const assert = require('node:assert/strict');
const test = require('node:test');
const { extractUpcomingMatchesFromMatchesPage } = require('../services/UpcomingMatchesService');

const fixture = (leftLink, rightLink) => `
  <div class="match-info">
    <div class="match-info-tournament-name"><a href="/overwatch/Test_Event">Test Event</a></div>
    <span class="timer-object" data-timestamp="1791032400"></span>
    <div class="match-info-header-opponent-left"><span class="name">${leftLink}</span></div>
    <div class="match-info-header-opponent"><span class="name">${rightLink}</span></div>
  </div>`;

test('upcoming match parser keeps source names and converts timestamps to milliseconds', () => {
  const html = `
    <div class="match-info">
      <div class="match-info-tournament-name"><a href="/overwatch/Test"> OWCS Test </a></div>
      <span class="timer-object" data-timestamp="1786600000"></span>
      <div class="match-info-header-opponent-left"><span class="name"> Team A </span></div>
      <div class="match-info-header-opponent"><span class="name"> TBD </span></div>
    </div>`;
  assert.deepEqual(extractUpcomingMatchesFromMatchesPage(html), [{
    tournamentName: 'OWCS Test',
    timestamp: 1786600000000,
    link: 'https://liquipedia.net/overwatch/Test',
    team1: { name: 'Team A', wikiName: '' },
    team2: { name: 'TBD', wikiName: '' }
  }]);
});

test('red links identify BF and SEJ by the wiki title in their edit URL', () => {
  const [match] = extractUpcomingMatchesFromMatchesPage(fixture(
    '<a href="/overwatch/index.php?title=SEIJI_ESPORTS&amp;action=edit&amp;redlink=1" title="SEIJI ESPORTS (page does not exist)">SEJ</a>',
    '<a href="/overwatch/index.php?title=Black_Flag&amp;action=edit&amp;redlink=1" title="Black Flag (page does not exist)">BF</a>'
  ));
  assert.deepEqual(match.team1, { name: 'SEJ', wikiName: 'SEIJI ESPORTS' });
  assert.deepEqual(match.team2, { name: 'BF', wikiName: 'Black Flag' });
});

test('article links take precedence over tooltips and preserve parentheses and encoded names', () => {
  const [match] = extractUpcomingMatchesFromMatchesPage(fixture(
    '<a href="https://liquipedia.net/overwatch/Team_(Academy)#Roster" title="Outdated tooltip">TA</a>',
    '<a href="/overwatch/%E9%98%9F%E4%BC%8D_Test" title="Other tooltip">TT</a>'
  ));
  assert.equal(match.team1.wikiName, 'Team (Academy)');
  assert.equal(match.team2.wikiName, '队伍 Test');
});

test('missing or invalid wiki links fall back to titles without the red-link tooltip suffix', () => {
  for (const href of ['', '/overwatch/index.php?action=edit', '/overwatch/%ZZ', 'https://example.com/overwatch/Other']) {
    const [match] = extractUpcomingMatchesFromMatchesPage(fixture(
      `<a href="${href}" title=" Black Flag   (page does not exist) ">BF</a>`,
      '<a title="Team (Academy)">TA</a>'
    ));
    assert.equal(match.team1.wikiName, 'Black Flag');
    assert.equal(match.team2.wikiName, 'Team (Academy)');
  }
});
