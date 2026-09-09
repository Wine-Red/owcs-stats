import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { verifyResources } from './lib/static-package.mjs';
const manifest = JSON.parse(await readFile('public/static-data/manifest.json', 'utf8'));
await verifyResources('public/static-data', manifest);
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'static'], { stdio: 'inherit' });
await writeFile('dist/DEPLOY.txt', `OWCS Stats static display package\n\nUpload ALL files to an HTTP(S) static host. No Node.js, database, API proxy or login is required.\nSubdirectories and hash-route refresh are supported. Keep the directory structure intact.\nThe package makes no external data/asset requests and contains no voting feature.\n\nData generated: ${manifest.generatedAt}\nDataset: ${manifest.datasetId}\nData mode: ${manifest.exportMode}\n\nTo update, upload a complete new release directory, verify it, then switch the site to it.\nDo not overlay a partial upload on the currently served directory. Keep the previous release for rollback.\n`);
