const dns = require('dns/promises');
const fs = require('fs/promises');
const net = require('net');
const path = require('path');
const sequelize = require('../config/database');
const Season = require('../models/Season');
const Team = require('../models/Team');
const Hero = require('../models/Hero');
const MapModel = require('../models/Map');
const Config = require('../models/Config');
const { ensureMediaSchema } = require('../database');
const manifest = require('../config/legacyMediaManifest');
const { legacySeasonIconRelativePath } = require('../database/seasonIconMigration');
const { getMediaRoot, isManagedMediaPath, storeImage } = require('../services/MediaStorageService');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const overwrite = args.has('--overwrite');
const legacyRoot = path.resolve(process.env.LEGACY_ASSET_ROOT || path.join(__dirname, '..', 'legacy-assets'));
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;

const isPrivateAddress = address => {
  const normalized = String(address || '').toLowerCase();
  if (net.isIPv4(normalized)) {
    const [a, b] = normalized.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(normalized)) {
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
      || normalized.startsWith('fe8') || normalized.startsWith('fe9')
      || normalized.startsWith('fea') || normalized.startsWith('feb');
  }
  return true;
};

const assertPublicUrl = async url => {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported source protocol');
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
    throw new Error('Source resolves to a private or invalid address');
  }
};

const readResponseWithLimit = async response => {
  const declared = Number(response.headers.get('content-length')) || 0;
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error('Source image exceeds 12 MB');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new Error('Source image exceeds 12 MB');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
};

const downloadImage = async source => {
  let current = new URL(source);
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    await assertPublicUrl(current);
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'OWCS-Stats-Media-Migrator/1.0' }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect ${response.status} has no location`);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) throw new Error(`Source is not an image (${contentType || 'unknown'})`);
    return readResponseWithLimit(response);
  }
  throw new Error('Too many redirects');
};

const firstExistingFile = async candidates => {
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
};

const teamLegacyFile = id => firstExistingFile(
  ['webp', 'png', 'jpg', 'jpeg', 'avif'].map(ext => path.join(legacyRoot, 'static-data', 'team-logos', `team-${id}.${ext}`))
);

const getSource = async (category, entity, currentValue) => {
  if (category === 'seasons') {
    const config = await Config.findByPk(`visualize_season_${entity.id}`);
    const relative = legacySeasonIconRelativePath(config?.value?.tags);
    const local = path.resolve(legacyRoot, relative);
    if (!local.startsWith(`${legacyRoot}${path.sep}`)) throw new Error('Legacy manifest path escapes its root');
    const existing = await firstExistingFile([local]);
    return existing ? { kind: 'bundled-season-icon', value: relative, buffer: await fs.readFile(existing) } : null;
  }

  if (category === 'teams') {
    const local = await teamLegacyFile(entity.id);
    if (local) return { kind: 'bundled-static-export', value: local, buffer: await fs.readFile(local) };
    if (/^https?:\/\//i.test(String(currentValue || ''))) {
      return { kind: 'download', value: currentValue, buffer: await downloadImage(currentValue) };
    }
    return null;
  }

  const relative = manifest[category]?.[entity.name];
  if (!relative) return null;
  const local = path.resolve(legacyRoot, relative);
  if (!local.startsWith(`${legacyRoot}${path.sep}`)) throw new Error('Legacy manifest path escapes its root');
  const existing = await firstExistingFile([local]);
  return existing ? { kind: 'bundled-legacy-asset', value: relative, buffer: await fs.readFile(existing) } : null;
};

const migrateCategory = async ({ category, model, field }, report) => {
  const entities = await model.findAll({ order: [['id', 'ASC']] });
  for (const entity of entities) {
    const currentValue = entity[field];
    if (!overwrite && isManagedMediaPath(currentValue, category)) {
      report.skipped.push({ category, id: entity.id, name: entity.name, reason: 'already-managed' });
      continue;
    }

    try {
      const source = await getSource(category, entity, currentValue);
      if (!source) {
        report.skipped.push({ category, id: entity.id, name: entity.name, reason: 'no-source' });
        continue;
      }
      if (!apply) {
        report.pending.push({ category, id: entity.id, name: entity.name, source: source.kind });
        continue;
      }
      const stored = await storeImage(category, source.buffer);
      await entity.update({ [field]: stored.path });
      report.migrated.push({
        category,
        id: entity.id,
        name: entity.name,
        previous: currentValue || null,
        source: source.kind,
        path: stored.path,
        bytes: stored.bytes
      });
    } catch (error) {
      report.failed.push({ category, id: entity.id, name: entity.name, error: error.message });
    }
  }
};

const main = async () => {
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    overwrite,
    startedAt: new Date().toISOString(),
    legacyRoot,
    mediaRoot: getMediaRoot(),
    pending: [],
    migrated: [],
    skipped: [],
    failed: []
  };

  await sequelize.authenticate();
  await ensureMediaSchema();
  await sequelize.sync();
  await migrateCategory({ category: 'seasons', model: Season, field: 'icon' }, report);
  await migrateCategory({ category: 'teams', model: Team, field: 'logo' }, report);
  await migrateCategory({ category: 'heroes', model: Hero, field: 'image' }, report);
  await migrateCategory({ category: 'maps', model: MapModel, field: 'image' }, report);

  report.finishedAt = new Date().toISOString();
  report.counts = Object.fromEntries(['pending', 'migrated', 'skipped', 'failed'].map(key => [key, report[key].length]));
  const reportRoot = path.join(getMediaRoot(), '.migration-reports');
  await fs.mkdir(reportRoot, { recursive: true, mode: 0o750 });
  const reportPath = path.join(reportRoot, `${report.startedAt.replace(/[:.]/g, '-')}-${report.mode}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o640 });
  console.log(JSON.stringify({ mode: report.mode, counts: report.counts, reportPath }, null, 2));
  if (report.failed.length > 0) process.exitCode = 1;
};

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
