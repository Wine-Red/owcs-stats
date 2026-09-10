import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { verifyResources } from './lib/static-package.mjs';
import { openDisplayPackage, decodeResource, digest } from './lib/display-package.mjs';
import { validateSiteConfig } from '../src/services/siteClient.mjs';
const live = process.argv.includes('--api'), directory = live ? 'dist-api' : 'dist';
const bundle = await openDisplayPackage(directory), html = bundle.html;
const app = [...html.matchAll(/<script type="module" data-owcs-app>([\s\S]*?)<\/script>/g)];
assert.equal(app.length, 1, 'expected one inline application');
const cspHash = createHash('sha256').update(app[0][1]).digest('base64');
assert.ok(html.includes(`script-src 'sha256-${cspHash}'`), 'CSP must authorize the exact bundled script');
assert.ok(html.includes('<style data-owcs-style>'));
assert.equal(/<script\b[^>]*\bsrc\s*=|<link\b[^>]*rel="(?:stylesheet|modulepreload)"/i.test(html), false, 'no external scripts, CSS or module preloads');
assert.equal((await readdir(directory)).includes('assets'), false, 'no secondary runtime bundles');
for (const [name, record] of Object.entries(bundle.payload.files)) {
  assert.ok(!name.startsWith('/') && !name.split('/').includes('..'), name);
  const bytes = decodeResource(record);
  assert.equal(bytes.length, record.bytes, name);
  assert.equal(digest(bytes), record.sha256, name);
}
if (live) {
  const config = validateSiteConfig(bundle.json('site-config.json'));
  assert.deepEqual(config, JSON.parse(await readFile(`${directory}/site-config.json`, 'utf8')));
  assert.equal(Object.keys(bundle.payload.files).some(name => name.startsWith('static-data/')), false);
  for (const origin of [new URL(config.apiBaseUrl).origin, config.mediaOrigin]) assert.ok(html.includes(origin));
} else {
  const manifest = bundle.json('static-data/manifest.json');
  assert.deepEqual(manifest, JSON.parse(await readFile(`${directory}/static-data/manifest.json`, 'utf8')));
  await verifyResources(`${directory}/static-data`, manifest, relative => bundle.read(`static-data/${relative}`));
}
console.log(`Embedded ${live ? 'API' : 'snapshot'} package verified: inline JS/CSS, CSP hash, ${Object.keys(bundle.payload.files).length} embedded resources`);
