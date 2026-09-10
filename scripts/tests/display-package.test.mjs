import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { embedDisplayPackage, openDisplayPackage, encodeResource, replaceDisplayResources, parseDisplayHtml } from '../lib/display-package.mjs';
import { createEmbeddedReader } from '../../src/services/embeddedPackage.mjs';

test('embedded package preserves script bytes/CSP despite HTML end tags and unsafe JSON', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'owcs-display-'));
  const output = path.join(root, 'dist');
  try {
    await mkdir(path.join(output, 'assets'), { recursive: true });
    await writeFile(path.join(output, 'index.html'), `<html><head><meta http-equiv="Content-Security-Policy" content="script-src 'self'"><link rel="icon" href="./favicon.ico"><script type="module" src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css"></head><body><div id="app"></div></body></html>`);
    await writeFile(path.join(output, 'assets/app.js'), 'window.example="</body></script>中文";');
    await writeFile(path.join(output, 'assets/app.css'), 'body{color:black}');
    await writeFile(path.join(output, 'favicon.ico'), Buffer.from([0, 1, 2]));
    const fixture = { text: '</script><script>window.injection=true</script>中文', rows: [1, null, 0] };
    await writeFile(path.join(output, 'fixture.json'), JSON.stringify(fixture));
    await embedDisplayPackage(output, root);
    const built = await openDisplayPackage(output);
    const code = built.html.match(/<script type="module" data-owcs-app>([\s\S]*?)<\/script>/)[1];
    assert.match(code, /window.example/);
    assert.ok(code.includes('</body>'));
    assert.ok(built.html.includes(`script-src 'sha256-${createHash('sha256').update(code).digest('base64')}'`));
    assert.deepEqual(built.json('fixture.json'), fixture);
    assert.deepEqual(await readdir(output), ['index.html']);
    assert.ok(!built.html.includes('<script>window.injection'));
    const edited = parseDisplayHtml(replaceDisplayResources(built.html, { 'fixture.json': { updated: true } }));
    assert.deepEqual(edited.json('fixture.json'), { updated: true });
    assert.ok(edited.html.includes(code), 'data fixtures must not change executable code');
  } finally {
    assert.ok(path.resolve(root).startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    await rm(root, { recursive: true, force: true });
  }
});

test('browser reader lazily decompresses Unicode JSON and reuses safe image URLs', async () => {
  const payload = { schemaVersion: 1, files: {
    'values.json': encodeResource(Buffer.from(JSON.stringify({ name: '守望先锋', missing: null })), 'application/json'),
    'unused.json': { type: 'application/json', encoding: 'gzip', data: 'broken' },
    'icons/test.png': encodeResource(Buffer.from([1, 2, 3]), 'image/png')
  } };
  const reader = createEmbeddedReader(payload);
  assert.deepEqual(reader.json('values.json'), { name: '守望先锋', missing: null });
  assert.throws(() => reader.json('missing.json'), /缺少数据/);
  assert.throws(() => reader.json('unused.json'));
  const url = reader.asset('icons/test.png');
  assert.equal(reader.asset('icons/test.png'), url);
  assert.equal(reader.asset('values.json'), '');
  assert.equal(reader.asset('missing.png'), '');
  assert.deepEqual(new Uint8Array(await (await fetch(url)).arrayBuffer()), new Uint8Array([1, 2, 3]));
  URL.revokeObjectURL(url);
});
