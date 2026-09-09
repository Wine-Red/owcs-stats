import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fetchJsonWithRetry } from './lib/fetch-json-with-retry.mjs';
import { hash, mediaSources, replaceMedia, validateSnapshot, writeResources, verifyResources } from './lib/static-package.mjs';

const root = process.cwd();
const config = JSON.parse(await readFile(path.join(root, 'static-export.config.json'), 'utf8'));
const production = process.argv.includes('--production');
const api = String(production ? process.env.OWCS_PRODUCTION_API_BASE || config.productionApiBase : process.env.OWCS_EXPORT_API_BASE || 'http://localhost:3000/api').replace(/\/$/, '');
const origin = new URL(api);
if (!['http:', 'https:'].includes(origin.protocol) || (production && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) throw new Error('Invalid export API origin');
const sourceFile = process.env.OWCS_STATIC_SNAPSHOT_FILE;
if (production && sourceFile) throw new Error('Production packages must fetch the configured production endpoint');
const publicRoot = path.resolve(root, 'public');
const destination = path.join(publicRoot, 'static-data');
const staging = path.join(publicRoot, `.static-export-${randomUUID()}`);
const backup = path.join(publicRoot, `.static-export-${randomUUID()}`);
// Every rename/removal below is confined to these generated children of public/.
for (const target of [destination, staging, backup]) if (path.dirname(path.resolve(target)) !== publicRoot) throw new Error('Unsafe export destination');

const imageBytes = async url => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      const type = (response.headers.get('content-type') || '').split(';')[0];
      if (!response.ok || !type.startsWith('image/')) throw new Error(`Invalid image response ${response.status} ${type}: ${url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error(`Invalid image size: ${url}`);
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'image/avif': 'avif', 'image/x-icon': 'ico' }[type];
      if (!extension) throw new Error(`Unsupported image type: ${type}`);
      return { bytes, extension };
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
};

try {
  const snapshot = validateSnapshot(sourceFile
    ? JSON.parse(await readFile(sourceFile, 'utf8'))
    : await fetchJsonWithRetry(`${api}/static-export/snapshot`, { attempts: 3, timeoutMs: 180000 }));
  console.log(`[static-export] schema v2, ${snapshot.counts.matches} matches, ${snapshot.counts.mapGames} maps`);
  await mkdir(path.join(staging, 'media'), { recursive: true });
  await mkdir(path.join(staging, 'team-logos'), { recursive: true });
  const tbd = 'https://owmini.xyz/images/tbd.png';
  const sources = [...new Set([...mediaSources(snapshot), tbd])];
  const replacements = new Map(), assets = [];
  let next = 0;
  const downloads = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    while (next < sources.length) {
      const source = sources[next++];
      const url = new URL(source, origin.origin);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Unsupported asset URL: ${source}`);
      const { bytes, extension } = await imageBytes(url);
      const sha256 = hash(bytes);
      const relative = source === tbd ? 'team-logos/team-tbd.png' : `media/${sha256}.${extension}`;
      await writeFile(path.join(staging, relative), bytes);
      replacements.set(source, `__OWCS_STATIC_BASE__/static-data/${relative}`);
      assets.push({ path: relative, sha256, bytes: bytes.length });
    }
  }));
  const failed = downloads.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  const localized = replaceMedia(snapshot, replacements);
  const files = await writeResources(staging, localized);
  const manifest = {
    schemaVersion: 2,
    generatedAt: snapshot.generatedAt,
    packagedAt: new Date().toISOString(),
    exportMode: production ? 'production' : 'development',
    sourceApi: sourceFile ? null : api,
    dataSource: sourceFile ? snapshot.dataSource || { kind: 'snapshot-file' } : { kind: 'api', url: api },
    assetOrigin: origin.origin,
    capabilities: { voting: false, externalRequests: false },
    scheduleObservedAt: new Date(snapshot.schedule.observedAt).toISOString(),
    ...snapshot.counts, files, assets,
    datasetId: hash(JSON.stringify(files)),
    warnings: []
  };
  await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await verifyResources(staging, manifest);
  let moved = false;
  try { await rename(destination, backup); moved = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await rename(staging, destination); } catch (error) { if (moved) await rename(backup, destination); throw error; }
  if (moved) await rm(backup, { recursive: true, force: true });
  console.log(`[static-export] Complete: ${Object.keys(files).length} resources, ${assets.length} local images. No external runtime requests.`);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  console.error(error.message);
  process.exitCode = 1;
}
