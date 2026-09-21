import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rename, rm, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { digest, parseDisplayHtml } from './lib/display-package.mjs';

// Extract the exact release ZIP outside the repository: npm cannot accidentally
// resolve the application's own node_modules or Vite configuration.
const root = await mkdtemp(path.join(await realpath(tmpdir()), 'owcs-api-build-'));
const run = args => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 180000 });
try {
  const archive = process.env.OWCS_API_BUILD_ARCHIVE || '.local/owcs-stats-api-build-production.zip';
  const files = unzipSync(await readFile(archive));
  assert.deepEqual(Object.keys(files).sort(), ['README.md', 'index.html', 'package-lock.json', 'package.json',
    'public/app.html', 'public/package-manifest.json', 'public/site-config.json', 'vite.config.mjs'].sort());
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.resolve(root, name);
    assert.ok(file.startsWith(`${root}${path.sep}`));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  assert.ok(files['index.html'].length < 2048, 'Vite must parse only the small entry');
  const original = await readFile('dist-api/index.html');
  assert.equal(digest(files['public/app.html']), digest(original));
  parseDisplayHtml(original.toString());
  assert.ok(process.env.npm_execpath, 'Run through npm run verify:api-build');
  run([process.env.npm_execpath, 'ci', '--no-audit', '--no-fund']);
  const verifyOutput = async label => {
    assert.equal(digest(await readFile(path.join(root, 'dist/app.html'))), digest(original), `${label}: app/CSP bytes unchanged`);
    assert.ok((await readFile(path.join(root, 'dist/index.html'))).length < 2048);
    for (const name of ['site-config.json', 'package-manifest.json']) {
      assert.equal(digest(await readFile(path.join(root, 'dist', name))), digest(files[`public/${name}`]));
    }
    console.log(`[api-build] PASS ${label}: byte-identical application and metadata`);
  };
  run([process.env.npm_execpath, 'run', 'build']);
  await verifyOutput('clean npm ci + npm run build');
  run(['node_modules/vite/bin/vite.js', 'build']);
  await verifyOutput('direct vite build');
  await rename(path.join(root, 'vite.config.mjs'), path.join(root, 'vite.config.disabled'));
  run(['node_modules/vite/bin/vite.js', 'build']);
  await verifyOutput('platform ignores custom Vite config');
  execFileSync(process.execPath, ['scripts/verify-partner-host.mjs', '--api'], {
    stdio: 'inherit', timeout: 300000,
    env: { ...process.env, OWCS_PARTNER_BUILD_DIR: path.join(root, 'dist') }
  });
} finally {
  assert.equal(path.dirname(root), await realpath(tmpdir()));
  assert.ok(path.basename(root).startsWith('owcs-api-build-'));
  assert.equal(await realpath(root), root);
  await rm(root, { recursive: true, force: true });
}
