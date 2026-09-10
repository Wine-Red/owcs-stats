import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteClient, validateSiteConfig, resolveSiteMedia } from './siteClient.mjs';
const config = { schemaVersion: 1, apiBaseUrl: 'https://stats.test/public-api/site/v1', mediaOrigin: 'https://stats.test',
  refreshIntervalMs: 60000, timeoutMs: 1000, assetBaseUrl: 'https://partner.test/partner/owcs/' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('config rejects mixed content, credentials, incompatible API and unbounded intervals', () => {
  assert.equal(validateSiteConfig(config).mediaOrigin, 'https://stats.test');
  for (const override of [{ schemaVersion: 2 }, { apiBaseUrl: 'https://x.test/api' }, { mediaOrigin: 'http://remote.test' },
    { mediaOrigin: 'https://user:secret@stats.test' }, { refreshIntervalMs: 1 }, { timeoutMs: -1 }]) {
    assert.throws(() => validateSiteConfig({ ...config, ...override }));
  }
});

test('media resolution supports subdirectories, dynamic uploads and nested DTOs without touching links', () => {
  const result = resolveSiteMedia({ logo: '/media/teams/new.webp', team: { image: '/heroes/test.png' },
    link: 'https://liquipedia.net/overwatch', icon: 'https://unmanaged.test/image.png', kills: 0, deaths: null }, config);
  assert.equal(result.logo, 'https://stats.test/media/teams/new.webp');
  assert.equal(result.team.image, 'https://partner.test/partner/owcs/heroes/test.png');
  assert.equal(result.link, 'https://liquipedia.net/overwatch');
  assert.equal(result.icon, ''); assert.equal(result.kills, 0); assert.equal(result.deaths, null);
});

test('coalesces reads, isolates caller mutations, expires data and always omits credentials', async () => {
  let time = 0, calls = 0;
  const client = createSiteClient({ getConfig: async () => config, now: () => time, fetcher: async (_url, options) => {
    calls++; assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-cache');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    return json([{ value: calls }]);
  } });
  const [a, b] = await Promise.all([client.get('/seasons'), client.get('/seasons')]);
  a[0].value = 99; assert.equal(b[0].value, 1); assert.equal(calls, 1);
  assert.equal((await client.get('/seasons'))[0].value, 1);
  time = 15001; assert.equal((await client.get('/seasons'))[0].value, 2);
  client.clear(); assert.equal((await client.get('/seasons'))[0].value, 3);
  await assert.rejects(client.post('/seasons', {}), error => error.response.status === 405);
  await assert.rejects(client.get('https://evil.test/x'), error => error.response.status === 400);
});

test('failed reads are not cached or replaced with empty data; retry recovers', async () => {
  let broken = true; const events = [];
  const client = createSiteClient({ getConfig: async () => config, notify: event => events.push(event),
    fetcher: async () => broken ? json({ error: 'down' }, 503) : json({ data: [1] }) });
  await assert.rejects(client.get('/seasons'));
  broken = false; assert.deepEqual(await client.get('/seasons'), { data: [1] });
  assert.deepEqual(events.map(event => event.type), ['error', 'success']);
});

test('HTML redirects and timeouts fail visibly; clearing prevents late reads poisoning new data', async () => {
  const htmlClient = createSiteClient({ getConfig: async () => config, fetcher: async () => new Response('<html>login</html>') });
  await assert.rejects(htmlClient.get('/seasons'), /返回异常/);
  const timeout = createSiteClient({ getConfig: async () => ({ ...config, timeoutMs: 10 }), fetcher: async (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')))) });
  await assert.rejects(timeout.get('/seasons'), /timeout/);
  let finish, calls = 0;
  const client = createSiteClient({ getConfig: async () => config, fetcher: async () => ++calls === 1 ? new Promise(resolve => { finish = resolve; }) : json('new') });
  const old = client.get('/seasons'); await new Promise(resolve => setImmediate(resolve));
  client.clear(); assert.equal(await client.get('/seasons'), 'new'); finish(json('old')); await old;
  assert.equal(await client.get('/seasons'), 'new');
});
