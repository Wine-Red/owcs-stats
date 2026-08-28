const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const MEDIA_CATEGORIES = Object.freeze({
  teams: { width: 1024, height: 1024, fit: 'inside', quality: 90 },
  heroes: { width: 1024, height: 1024, fit: 'inside', quality: 90 },
  maps: { width: 1920, height: 1080, fit: 'inside', quality: 86 }
});

const ALLOWED_INPUT_FORMATS = new Set(['avif', 'jpeg', 'png', 'webp']);
const MAX_INPUT_PIXELS = 40_000_000;

const getMediaRoot = () => path.resolve(process.env.MEDIA_ROOT || path.join(__dirname, '..', 'media'));

const assertCategory = category => {
  const normalized = String(category || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(MEDIA_CATEGORIES, normalized)) {
    const error = new Error('Unsupported media category');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};

const publicPathFor = (category, fileName) => `/media/${category}/${fileName}`;

const transformImage = async (category, input) => {
  const config = MEDIA_CATEGORIES[assertCategory(category)];
  const pipeline = sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
    animated: false
  });
  const metadata = await pipeline.metadata();
  if (!ALLOWED_INPUT_FORMATS.has(metadata.format)) {
    const error = new Error('Only PNG, JPEG, WebP and AVIF images are supported');
    error.statusCode = 415;
    throw error;
  }

  return pipeline
    .rotate()
    .resize({
      width: config.width,
      height: config.height,
      fit: config.fit,
      withoutEnlargement: true
    })
    .webp({ quality: config.quality, alphaQuality: 100, effort: 5 })
    .toBuffer();
};

const storeImage = async (category, input) => {
  const normalizedCategory = assertCategory(category);
  if (!Buffer.isBuffer(input) || input.length === 0) {
    const error = new Error('Image file is required');
    error.statusCode = 400;
    throw error;
  }

  const output = await transformImage(normalizedCategory, input);
  const hash = crypto.createHash('sha256').update(output).digest('hex');
  const fileName = `${hash.slice(0, 32)}.webp`;
  const categoryRoot = path.join(getMediaRoot(), normalizedCategory);
  const destination = path.join(categoryRoot, fileName);

  await fs.mkdir(categoryRoot, { recursive: true, mode: 0o755 });
  try {
    await fs.writeFile(destination, output, { flag: 'wx', mode: 0o644 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  return {
    category: normalizedCategory,
    path: publicPathFor(normalizedCategory, fileName),
    hash,
    bytes: output.length,
    mimeType: 'image/webp'
  };
};

const isManagedMediaPath = (value, category) => {
  const normalizedCategory = assertCategory(category);
  return new RegExp(`^/media/${normalizedCategory}/[a-f0-9]{32}\\.webp$`).test(String(value || ''));
};

module.exports = {
  MEDIA_CATEGORIES,
  getMediaRoot,
  assertCategory,
  storeImage,
  isManagedMediaPath
};
