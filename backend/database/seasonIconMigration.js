const fs = require('fs/promises');
const path = require('path');
const Config = require('../models/Config');
const Season = require('../models/Season');
const manifest = require('../config/legacyMediaManifest');
const { storeImage } = require('../services/MediaStorageService');

const MIGRATION_KEY = 'system_migration_season_icons_v1';
const REGION_TAG_PRIORITY = Object.freeze(['KR', 'NA', 'CN', 'EMEA']);

const normalizeTags = tags => Array.isArray(tags)
  ? tags.map(tag => String(tag || '').trim().toUpperCase()).filter(Boolean)
  : [];

const legacySeasonIconRelativePath = tags => {
  const normalizedTags = new Set(normalizeTags(tags));
  const region = REGION_TAG_PRIORITY.find(tag => normalizedTags.has(tag));
  return region
    ? manifest.seasonIcons.regions[region]
    : manifest.seasonIcons.default;
};

const candidateLegacyRoots = () => {
  const roots = [];
  if (process.env.LEGACY_ASSET_ROOT) roots.push(path.resolve(process.env.LEGACY_ASSET_ROOT));
  roots.push(
    path.resolve(__dirname, '..', 'legacy-assets'),
    path.resolve(__dirname, '..', '..', 'public')
  );
  return [...new Set(roots)];
};

const findLegacyIcon = async relativePath => {
  for (const root of candidateLegacyRoots()) {
    const candidate = path.resolve(root, relativePath);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) continue;
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
};

const migrateLegacySeasonIcons = async ({
  configModel = Config,
  seasonModel = Season,
  findIcon = findLegacyIcon,
  readFile = fs.readFile,
  store = storeImage,
  now = () => new Date()
} = {}) => {
  const marker = await configModel.findByPk(MIGRATION_KEY);
  if (marker?.value?.completed) {
    return { alreadyApplied: true, migrated: 0, skipped: 0, failed: 0 };
  }

  const seasons = await seasonModel.findAll({ order: [['id', 'ASC']] });
  const configKeys = seasons.map(season => `visualize_season_${season.id}`);
  const configs = configKeys.length > 0
    ? await configModel.findAll({ where: { key: configKeys } })
    : [];
  const configByKey = new Map(configs.map(config => [config.key, config.value]));
  const result = { alreadyApplied: false, migrated: 0, skipped: 0, failed: 0, errors: [] };

  for (const season of seasons) {
    if (String(season.icon || '').trim()) {
      result.skipped += 1;
      continue;
    }

    const visualConfig = configByKey.get(`visualize_season_${season.id}`) || {};
    const relativePath = legacySeasonIconRelativePath(visualConfig.tags);
    try {
      const source = await findIcon(relativePath);
      if (!source) throw new Error(`legacy asset not found: ${relativePath}`);
      const stored = await store('seasons', await readFile(source));
      await season.update({ icon: stored.path });
      result.migrated += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({ seasonId: season.id, name: season.name, error: error.message });
      console.warn(`[season-icons] season ${season.id} migration failed: ${error.message}`);
    }
  }

  if (result.failed === 0) {
    await configModel.upsert({
      key: MIGRATION_KEY,
      value: {
        completed: true,
        completedAt: now().toISOString(),
        migrated: result.migrated,
        skipped: result.skipped
      },
      description: 'Existing hard-coded season icons migrated to managed media'
    });
  }

  return result;
};

module.exports = {
  MIGRATION_KEY,
  REGION_TAG_PRIORITY,
  legacySeasonIconRelativePath,
  migrateLegacySeasonIcons
};
