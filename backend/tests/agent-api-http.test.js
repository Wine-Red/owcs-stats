const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const app = require('../app');

const request = (port, { method = 'GET', path = '/' } = {}) => new Promise((resolve, reject) => {
  const req = http.request({
    hostname: '127.0.0.1',
    port,
    path,
    method
  }, res => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      resolve({ status: res.statusCode, headers: res.headers, body: body ? JSON.parse(body) : null });
    });
  });
  req.on('error', reject);
  req.end();
});

test('Agent API is public and read-only', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;

  const response = await request(port, { path: '/agent/v1/meta' });
  assert.equal(response.status, 200);
  assert.equal(response.body.api_version, 'v1');
  assert.equal(response.body.data.boundaries.unknown_is_not_zero, true);
  assert.ok(response.headers['x-request-id']);

  const write = await request(port, { method: 'POST', path: '/agent/v1/meta' });
  assert.equal(write.status, 405);
  assert.equal(write.body.error.code, 'METHOD_NOT_ALLOWED');
});
