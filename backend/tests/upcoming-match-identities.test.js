const assert = require('node:assert/strict');
const test = require('node:test');
const { Readable } = require('node:stream');
const https = require('node:https');
const { extractUpcomingMatchesFromMatchesPage } = require('../services/UpcomingMatchesService');
const { attachMatchIdentities } = require('../services/LiquipediaMatchIdentity');

test('red-link schedule matches receive verified IDs while time and ambiguity checks remain enforced', async t => {
  const page = 'Test Event';
  const matchTemplate = (first, second) => `{{Match|date=October 3rd, 2026 - 21:00 {{Abbr/CST}}
    |opponent1={{TeamOpponent|${first}}}|opponent2={{TeamOpponent|${second}}}
  }}`;
  let wikitext = `{{Matchlist|id=redlinks
    |M1=${matchTemplate('JD Gaming', 'Black Flag')}
    |M2=${matchTemplate('SEIJI ESPORTS', 'T1')}}}`;
  t.mock.method(https, 'get', (options, callback) => {
    assert.match(options.path, /action=query/);
    const payload = { query: { pages: { 1: { pageid: 1, title: page,
      revisions: [{ slots: { main: { '*': wikitext } } }] } } } };
    const response = Readable.from([Buffer.from(JSON.stringify(payload))]);
    response.statusCode = 200;
    response.headers = {};
    process.nextTick(() => callback(response));
    return { on() { return this; }, destroy() {} };
  });
  const html = (left, right) => `<div class="match-info">
    <div class="match-info-tournament-name"><a href="/overwatch/Test_Event">Test Event</a></div>
    <span class="timer-object" data-timestamp="1791032400"></span>
    <div class="match-info-header-opponent-left"><span class="name">${left}</span></div>
    <div class="match-info-header-opponent"><span class="name">${right}</span></div>
  </div>`;
  const matches = extractUpcomingMatchesFromMatchesPage(
    html('<a href="/overwatch/JD_Gaming" title="JD Gaming">JDG</a>',
      '<a href="/overwatch/index.php?title=Black_Flag&amp;action=edit&amp;redlink=1" title="Black Flag (page does not exist)">BF</a>')
    + html('<a href="/overwatch/index.php?title=SEIJI_ESPORTS&amp;action=edit&amp;redlink=1" title="SEIJI ESPORTS (page does not exist)">SEJ</a>',
      '<a href="/overwatch/T1" title="T1">T1</a>')
  );
  const identified = await attachMatchIdentities(matches);
  assert.deepEqual(identified.map(match => match.sourceId), ['overwatch:redlinks_0001', 'overwatch:redlinks_0002']);
  assert.ok(identified.every(match => match.sourcePage === page));

  const mismatchedTime = await attachMatchIdentities([{ ...matches[0], timestamp: matches[0].timestamp + 3600000 }]);
  assert.equal(mismatchedTime[0].sourceId, null);

  const changedOpponent = await attachMatchIdentities([{ ...matches[0], team2: matches[1].team2 }]);
  assert.equal(changedOpponent[0].sourceId, null);

  wikitext = `{{Matchlist|id=ambiguous|M1=${matchTemplate('JD Gaming', 'Black Flag')}
    |M2=${matchTemplate('JD Gaming', 'Black Flag')}}}`;
  const ambiguous = await attachMatchIdentities([matches[0]]);
  assert.equal(ambiguous[0].sourceId, null);
});
