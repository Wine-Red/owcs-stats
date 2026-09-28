import { copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { hash, verifyResources } from './static-package.mjs';

const descriptors = manifest => [...Object.values(manifest.files), ...(manifest.assets || [])];
const resourcePath = (directory, relative) => {
  if (!/^(?:data|media|team-logos)\/[a-zA-Z0-9._-]+$/.test(relative)) throw new Error(`Invalid static resource path: ${relative}`);
  return path.join(directory, relative);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Windows may hold a file briefly while scanning it. Never delete the old
// manifest to force replacement: readers must retain a complete generation.
const replaceFile = async (source, destination, renameFile, wait) => {
  for (let attempt = 0; ; attempt++) {
    try { return await renameFile(source, destination); }
    catch (error) {
      if (attempt >= 6 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      await wait(Math.min(50 * 2 ** attempt, 1000));
    }
  }
};

export const publishStaticData = async (staging, destination, manifest, {
  renameFile = rename, wait = sleep, warn = console.warn
} = {}) => {
  await verifyResources(staging, manifest);
  const records = descriptors(manifest);
  for (const item of records) resourcePath(destination, item.path);
  await mkdir(destination, { recursive: true });
  let previous;
  try { previous = JSON.parse(await readFile(path.join(destination, 'manifest.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  for (const item of records) {
    const target = resourcePath(destination, item.path);
    try {
      const existing = await readFile(target);
      if (existing.length !== item.bytes || hash(existing) !== item.sha256) throw new Error(`Static resource collision or corruption: ${item.path}`);
      continue;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await copyFile(resourcePath(staging, item.path), temporary);
      await replaceFile(temporary, target, renameFile, wait);
    } finally { await rm(temporary, { force: true }); }
  }
  await verifyResources(destination, manifest);
  const temporaryManifest = path.join(destination, `.manifest-${randomUUID()}.json`);
  try {
    // Copy the verified staging manifest exactly, then commit with one file rename.
    const sourceManifest = path.join(staging, 'manifest.json');
    if (JSON.stringify(JSON.parse(await readFile(sourceManifest, 'utf8'))) !== JSON.stringify(manifest)) throw new Error('Staging manifest changed during publication');
    await copyFile(sourceManifest, temporaryManifest);
    await replaceFile(temporaryManifest, path.join(destination, 'manifest.json'), renameFile, wait);
  } finally { await rm(temporaryManifest, { force: true }); }

  // Cleanup is after the commit. A locked obsolete file cannot invalidate the
  // new package; build-display copies only resources named by the new manifest.
  const currentPaths = new Set(records.map(item => item.path));
  for (const item of previous?.schemaVersion === 2 ? descriptors(previous) : []) {
    if (currentPaths.has(item.path)) continue;
    try { await rm(resourcePath(destination, item.path), { force: true, maxRetries: 3, retryDelay: 100 }); }
    catch (error) { warn(`[static-export] Obsolete resource retained: ${item.path}: ${error.message}`); }
  }
};

export const copyStaticData = async (source, destination, manifest) => {
  await mkdir(destination, { recursive: true });
  for (const item of descriptors(manifest)) {
    const target = resourcePath(destination, item.path);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(resourcePath(source, item.path), target);
  }
  await copyFile(path.join(source, 'manifest.json'), path.join(destination, 'manifest.json'));
  const copied = JSON.parse(await readFile(path.join(destination, 'manifest.json'), 'utf8'));
  if (JSON.stringify(copied) !== JSON.stringify(manifest)) throw new Error('Static manifest changed during build; run the build again');
  await verifyResources(destination, manifest);
};
