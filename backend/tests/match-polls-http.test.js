const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createPollRouter } = require('../routes/polls');

test('public voting routes validate origins, avoid shared caching and rate-limit a visitor', async t => {
  let votes = 0;
  const app = express();
  app.use(express.json());
  app.use('/poll-api', createPollRouter({
    createVisitor: async () => 'test-token',
    getSummary: async (seasonId, token) => ({ seasonId, authenticated: !!token }),
    castVote: async () => { votes++; return { total: 1 }; }
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/poll-api`;
  let r = await fetch(`${base}/summary?seasonId=24`, { headers: { 'X-Vote-Token': 'test-token' } });
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await r.json(), { seasonId: '24', authenticated: true });
  r = await fetch(`${base}/vote`, { method: 'POST', headers: { Origin: 'https://untrusted.example' } });
  assert.equal(r.status, 403);
  assert.equal(votes, 0);
  for (let i = 0; i < 21; i++) {
    r = await fetch(`${base}/vote`, { method: 'POST', headers: { Origin: 'https://stats.owmini.xyz', 'X-Vote-Token': 'same-visitor' } });
    assert.equal(r.status, i < 20 ? 200 : 429);
  }
});

test('open partner policy accepts web origins but still rejects opaque origins',async t=>{
 const previous=process.env.POLL_PARTNER_ORIGINS;process.env.POLL_PARTNER_ORIGINS='*';
 const app=express();app.use('/poll-api',createPollRouter({createVisitor:async()=> 'fixture-token'}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{if(previous===undefined)delete process.env.POLL_PARTNER_ORIGINS;else process.env.POLL_PARTNER_ORIGINS=previous;await new Promise(r=>server.close(r));});const base=`http://127.0.0.1:${server.address().port}/poll-api/visitor`;
 assert.equal((await fetch(base,{method:'POST',headers:{origin:'https://arbitrary.example'}})).status,200);assert.equal((await fetch(base,{method:'POST',headers:{origin:'null'}})).status,403);
});
