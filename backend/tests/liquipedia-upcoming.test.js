const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const https = require('https');

const MatchController = require('../controllers/MatchController');

test('upcoming endpoint requests S/A tiers before applying the 50-match limit', async (t) => {
  const originalGet = https.get;
  let requestedPath = '';

  t.after(() => {
    https.get = originalGet;
  });

  https.get = (options, callback) => {
    requestedPath = options.path;
    const payload = JSON.stringify({
      parse: {
        text: {
          '*': `
            <div class="match-info">
              <div class="match-info-tournament-name">
                <a href="/overwatch/Overwatch_Champions_Series/2026/Midseason_Championship/Group_Stage#Group_A">
                  OWCS Midseason Championship Group Stage - Group A
                </a>
              </div>
              <span class="timer-object" data-timestamp="1785319200"></span>
              <div class="match-info-header-opponent-left"><span class="name">VP</span></div>
              <div class="match-info-header-opponent"><span class="name">9Z</span></div>
            </div>
          `
        }
      }
    });
    const response = Readable.from([Buffer.from(payload)]);
    response.statusCode = 200;
    response.headers = {};
    process.nextTick(() => callback(response));
    return {
      on() { return this; },
      destroy() {}
    };
  };

  let responseBody;
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return body;
    }
  };

  await MatchController.getUpcomingMatches({}, response);

  assert.equal(response.statusCode, 200);
  assert.match(decodeURIComponent(requestedPath), /filterbuttons-liquipediatier=1,2/);
  assert.equal(responseBody.data.length, 1);
  assert.equal(responseBody.data[0].tournamentName, 'OWCS Midseason Championship Group Stage - Group A');
  assert.equal(responseBody.data[0].team1.name, 'VP');
  assert.equal(responseBody.data[0].team2.name, '9Z');
});
