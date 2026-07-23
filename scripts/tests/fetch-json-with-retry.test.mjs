import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJsonWithRetry } from '../lib/fetch-json-with-retry.mjs';

test('retries transient 502 responses with exponential backoff', async () => {
  let calls = 0;
  const delays = [];
  const retries = [];
  const result = await fetchJsonWithRetry('https://example.test/api/data', {
    fetchImpl: async () => {
      calls += 1;
      if (calls <= 2) {
        return new Response('temporary nginx failure', {
          status: 502,
          statusText: 'Bad Gateway'
        });
      }
      return Response.json({ ok: true });
    },
    baseDelayMs: 10,
    sleepImpl: async delayMs => delays.push(delayMs),
    onRetry: details => retries.push(details)
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 20]);
  assert.deepEqual(retries.map(item => item.nextAttempt), [2, 3]);
});

test('does not retry a non-transient 404 response', async () => {
  let calls = 0;

  await assert.rejects(
    fetchJsonWithRetry('https://example.test/api/missing', {
      fetchImpl: async () => {
        calls += 1;
        return new Response('not found', { status: 404, statusText: 'Not Found' });
      },
      sleepImpl: async () => assert.fail('404 must not be retried')
    }),
    /404 Not Found/
  );
  assert.equal(calls, 1);
});

test('fails after five retryable responses instead of returning partial data', async () => {
  let calls = 0;
  const delays = [];

  await assert.rejects(
    fetchJsonWithRetry('https://example.test/api/unavailable', {
      fetchImpl: async () => {
        calls += 1;
        return new Response('unavailable', { status: 503, statusText: 'Service Unavailable' });
      },
      attempts: 5,
      baseDelayMs: 10,
      maxDelayMs: 80,
      sleepImpl: async delayMs => delays.push(delayMs)
    }),
    /503 Service Unavailable/
  );
  assert.equal(calls, 5);
  assert.deepEqual(delays, [10, 20, 40, 80]);
});

test('retries a network error and then succeeds', async () => {
  let calls = 0;
  const result = await fetchJsonWithRetry('https://example.test/api/data', {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return Response.json({ recovered: true });
    },
    sleepImpl: async () => {}
  });

  assert.deepEqual(result, { recovered: true });
  assert.equal(calls, 2);
});
