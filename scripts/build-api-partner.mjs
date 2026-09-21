import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { openDisplayPackage } from './lib/display-package.mjs';

// Explicit whitelist: never include repository source, credentials, node_modules,
// or stale local outputs in the handoff archive. Files live at the ZIP root.
const bundle = await openDisplayPackage('dist-api');
const manifest = JSON.parse(await readFile('dist-api/package-manifest.json', 'utf8'));
if (manifest.mode !== 'api' || manifest.delivery !== 'embedded-html') throw new Error('Build the API display package first');
const files = {};
for (const name of ['package.json', 'package-lock.json', 'vite.config.mjs', 'index.html', 'README.md']) {
  files[name] = new Uint8Array(await readFile(new URL(`./partner-build/${name}`, import.meta.url)));
}
files['public/app.html'] = new TextEncoder().encode(bundle.html);
for (const name of ['site-config.json', 'package-manifest.json']) {
  files[`public/${name}`] = new Uint8Array(await readFile(`dist-api/${name}`));
}
await mkdir('.local', { recursive: true });
const archive = '.local/owcs-stats-api-build-production.zip';
await writeFile(archive, zipSync(files, { level: 6 }));
console.log(`Build-compatible API archive: ${archive} (${Object.keys(files).length} files, root package.json, output dist/)`);
