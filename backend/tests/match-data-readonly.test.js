const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const app = require('../app');

const request = (port, method, path) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port, method, path }, res => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null });
    });
  });
  req.on('error', reject);
  req.end();
});

test('Stats rejects every direct match-data write surface', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const writes = [
    ['POST', '/api/matches'],
    ['PUT', '/api/matches/1'],
    ['DELETE', '/api/matches/1'],
    ['POST', '/api/map-games/import'],
    ['PUT', '/api/map-games/1'],
    ['DELETE', '/api/map-games/1'],
    ['POST', '/api/player-stats'],
    ['PUT', '/api/player-stats/1'],
    ['DELETE', '/api/player-stats/1']
  ];

  for (const [method, path] of writes) {
    const response = await request(port, method, path);
    assert.equal(response.status, 405, `${method} ${path}`);
    assert.equal(response.body.code, 'MATCH_DATA_READ_ONLY');
  }
});
