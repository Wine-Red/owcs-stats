const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const sharp = require('sharp');

const { isManagedMediaPath, storeImage } = require('../services/MediaStorageService');

test('stores normalized images in isolated category directories and deduplicates content', async t => {
  const previousRoot = process.env.MEDIA_ROOT;
  const mediaRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'owcs-media-'));
  process.env.MEDIA_ROOT = mediaRoot;
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.MEDIA_ROOT;
    else process.env.MEDIA_ROOT = previousRoot;
    await fs.rm(mediaRoot, { recursive: true, force: true });
  });

  const source = await sharp({
    create: { width: 80, height: 60, channels: 4, background: { r: 250, g: 204, b: 21, alpha: 0.8 } }
  }).png().toBuffer();

  const first = await storeImage('heroes', source);
  const duplicate = await storeImage('heroes', source);
  const map = await storeImage('maps', source);

  assert.equal(first.path, duplicate.path);
  assert.match(first.path, /^\/media\/heroes\/[a-f0-9]{32}\.webp$/);
  assert.match(map.path, /^\/media\/maps\/[a-f0-9]{32}\.webp$/);
  assert.equal(isManagedMediaPath(first.path, 'heroes'), true);
  assert.equal(isManagedMediaPath(first.path, 'maps'), false);

  const stored = await fs.readFile(path.join(mediaRoot, first.path.replace('/media/', '')));
  const metadata = await sharp(stored).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 80);
  assert.equal(metadata.height, 60);
});

test('rejects invalid categories and non-image payloads', async () => {
  await assert.rejects(() => storeImage('players', Buffer.from('not-an-image')), /Unsupported media category/);
  await assert.rejects(() => storeImage('teams', Buffer.from('not-an-image')));
});
