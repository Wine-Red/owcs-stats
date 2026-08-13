const assert = require('node:assert/strict');
const test = require('node:test');
const { extractUpcomingMatchesFromMatchesPage } = require('../services/UpcomingMatchesService');

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
    team1: { name: 'Team A' },
    team2: { name: 'TBD' }
  }]);
});
