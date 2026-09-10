import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('dist-api/site-config.json', 'utf8'));
const base = config.apiBaseUrl;
const origin = process.env.OWCS_STATIC_PREVIEW_URL || 'https://partner.example';
const request = (path, options = {}) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(90000), ...options,
  headers: { Origin: new URL(origin).origin, ...options.headers } });
const options = await request('/seasons', { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'If-None-Match' } });
assert.equal(options.status, 204, 'public gateway must permit preflight');
assert.equal(options.headers.get('access-control-allow-origin'), '*');
assert.equal(options.headers.get('access-control-allow-credentials'), null);
const response = await request('/seasons');
assert.equal(response.status, 200); assert.ok((await response.json()).length);
assert.equal(response.headers.get('access-control-allow-origin'), '*');
const etag = response.headers.get('etag'); assert.ok(etag);
assert.equal((await request('/seasons', { headers: { 'If-None-Match': etag } })).status, 304);
assert.equal((await request('/seasons', { method: 'HEAD' })).status, 200);
// Deliberately use a nonexistent resource: no legitimate application mutation.
assert.equal((await request('/__read_only_probe__', { method: 'POST' })).status, 405);
assert.equal((await request('/config/private_secret')).status, 404);
assert.equal((await request('/teams/1/admin-context')).status, 404);
assert.equal((await request('/matches?pageSize=0')).status, 400);
const meta = await request('/meta'); assert.equal(meta.status, 200);
const data = await meta.json(); assert.equal(data.apiVersion, 1); assert.match(data.revision, /^[a-f0-9]{64}$/);
const teams = await (await request('/teams')).json();
for (const source of teams.map(team => team.logo).filter(Boolean)) {
  assert.ok(source.startsWith('/media/') || source.startsWith(`${config.mediaOrigin}/media/`), `Unmanaged team image: ${source}`);
}
const sample = teams.find(team => team.logo)?.logo;
if (sample) {
  const media = await fetch(new URL(sample, config.mediaOrigin), { headers: { Origin: new URL(origin).origin }, signal: AbortSignal.timeout(30000) });
  assert.equal(media.status, 200); assert.match(media.headers.get('content-type'), /^image\//);
  assert.equal(media.headers.get('access-control-allow-origin'), '*');
  assert.notEqual(media.headers.get('cross-origin-resource-policy'), 'same-origin');
}
console.log('Site API gateway verified: anonymous GET/HEAD/OPTIONS, CORS, 304, 400/404/405, metadata and managed media');
