import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hash, verifyResources } from '../lib/static-package.mjs';
import { publishStaticData, copyStaticData } from '../lib/publish-static-data.mjs';

const generation = async (root, name, value) => {
  const staging = path.join(root, name), bytes = Buffer.from(JSON.stringify(value));
  const relative = `data/collections.teams-${hash(bytes).slice(0, 16)}.json`;
  const manifest = { schemaVersion: 2, datasetId: name,
    files: { 'collections.teams': { path: relative, sha256: hash(bytes), bytes: bytes.length } }, assets: [] };
  await mkdir(path.join(staging, 'data'), { recursive: true });
  await writeFile(path.join(staging, relative), bytes);
  await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest));
  return { staging, manifest };
};
const setup = async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'owcs-publish-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, destination: path.join(root, 'static-data') };
};

test('publication replaces only files, commits the manifest last and removes obsolete resources', async t => {
  const { root, destination } = await setup(t);
  const first = await generation(root, 'first', [{ id: 1 }]);
  const second = await generation(root, 'second', [{ id: 1 }, { id: 2 }]);
  await publishStaticData(first.staging, destination, first.manifest);
  let checked = false;
  await publishStaticData(second.staging, destination, second.manifest, { renameFile: async (source, target) => {
    assert.ok(source.endsWith('.tmp') || path.basename(source).startsWith('.manifest-'), 'no directory rename');
    assert.equal(JSON.parse(await readFile(path.join(destination, 'manifest.json'))).datasetId, 'first');
    if (path.basename(target) === 'manifest.json') {
      await verifyResources(destination, second.manifest);
      await verifyResources(destination, first.manifest);
      checked = true;
    }
    return rename(source, target);
  } });
  assert.ok(checked);
  assert.deepEqual(JSON.parse(await readFile(path.join(destination, 'manifest.json'))), second.manifest);
  await verifyResources(destination, second.manifest);
  assert.deepEqual(await readdir(path.join(destination, 'data')), [path.basename(second.manifest.files['collections.teams'].path)]);
  await publishStaticData(second.staging, destination, second.manifest);
});

test('a locked manifest preserves the old complete package; a later retry succeeds', async t => {
  const { root, destination } = await setup(t);
  const first = await generation(root, 'first', [{ id: 1 }]);
  const second = await generation(root, 'second', [{ id: 2 }]);
  await publishStaticData(first.staging, destination, first.manifest);
  await assert.rejects(publishStaticData(second.staging, destination, second.manifest, {
    wait: async () => {}, renameFile: (source, target) => {
      if (path.basename(target) === 'manifest.json') throw Object.assign(new Error('locked'), { code: 'EPERM' });
      return rename(source, target);
    }
  }), { code: 'EPERM' });
  assert.deepEqual(JSON.parse(await readFile(path.join(destination, 'manifest.json'))), first.manifest);
  await verifyResources(destination, first.manifest);
  assert.ok(!(await readdir(destination)).some(name => name.startsWith('.manifest-')));
  let attempts = 0;
  await publishStaticData(second.staging, destination, second.manifest, {
    wait: async () => {}, renameFile: (source, target) => {
      if (path.basename(target) === 'manifest.json' && ++attempts < 3) throw Object.assign(new Error('scanning'), { code: 'EBUSY' });
      return rename(source, target);
    }
  });
  assert.equal(attempts, 3);
  await verifyResources(destination, second.manifest);
});

test('corrupt input and resource collisions never overwrite the active package', async t => {
  const { root, destination } = await setup(t);
  const first = await generation(root, 'first', [{ id: 1 }]);
  const second = await generation(root, 'second', [{ id: 2 }]);
  await publishStaticData(first.staging, destination, first.manifest);
  const original = await readFile(path.join(second.staging, second.manifest.files['collections.teams'].path));
  await writeFile(path.join(second.staging, second.manifest.files['collections.teams'].path), 'corrupt');
  await assert.rejects(publishStaticData(second.staging, destination, second.manifest), /校验失败/);
  await writeFile(path.join(second.staging, second.manifest.files['collections.teams'].path), original);
  await writeFile(path.join(destination, second.manifest.files['collections.teams'].path), 'collision');
  await assert.rejects(publishStaticData(second.staging, destination, second.manifest), /collision or corruption/);
  assert.deepEqual(JSON.parse(await readFile(path.join(destination, 'manifest.json'))), first.manifest);
  await verifyResources(destination, first.manifest);
});

test('build copies only active manifest resources even if obsolete files remain locked', async t => {
  const { root, destination } = await setup(t);
  const first = await generation(root, 'first', [{ id: 1 }]);
  await publishStaticData(first.staging, destination, first.manifest);
  await writeFile(path.join(destination, 'data/obsolete.json'), 'old private fixture');
  const output = path.join(root, 'dist/static-data');
  await copyStaticData(destination, output, first.manifest);
  assert.deepEqual(await readdir(path.join(output, 'data')), [path.basename(first.manifest.files['collections.teams'].path)]);
  await verifyResources(output, first.manifest);
});
