const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MIGRATION_KEY,
  legacySeasonIconRelativePath,
  migrateLegacySeasonIcons
} = require('../database/seasonIconMigration');

test('maps legacy region tags to their matching season icons', () => {
  assert.equal(legacySeasonIconRelativePath(['OWCS', 'KR']), 'icons/areas/KR_light.png');
  assert.equal(legacySeasonIconRelativePath(['owcs', 'na']), 'icons/areas/NA_light.png');
  assert.equal(legacySeasonIconRelativePath(['CN', 'A-Tier']), 'icons/areas/CN_light.png');
  assert.equal(legacySeasonIconRelativePath(['EMEA']), 'icons/areas/EMEA_light.png');
});

test('uses the legacy generic icon without a supported region tag', () => {
  assert.equal(legacySeasonIconRelativePath(['OWCS', 'S-Tier']), 'icons/OWCS_Dark.png');
  assert.equal(legacySeasonIconRelativePath(null), 'icons/OWCS_Dark.png');
});

test('keeps the former region priority for malformed multi-region configs', () => {
  assert.equal(legacySeasonIconRelativePath(['EMEA', 'KR']), 'icons/areas/KR_light.png');
});

test('migrates every unconfigured season and records an idempotency marker', async () => {
  const updated = [];
  let markerPayload = null;
  const seasons = [
    { id: 7, name: 'CN Stage', icon: null, update: async value => updated.push({ id: 7, ...value }) },
    { id: 9, name: 'Global Finals', icon: '', update: async value => updated.push({ id: 9, ...value }) },
    { id: 10, name: 'Already managed', icon: '/media/seasons/existing.webp', update: async () => assert.fail() }
  ];
  const configModel = {
    findByPk: async key => {
      assert.equal(key, MIGRATION_KEY);
      return null;
    },
    findAll: async () => [{ key: 'visualize_season_7', value: { tags: ['OWCS', 'CN'] } }],
    upsert: async payload => { markerPayload = payload; }
  };
  const sources = [];

  const result = await migrateLegacySeasonIcons({
    configModel,
    seasonModel: { findAll: async () => seasons },
    findIcon: async relativePath => {
      sources.push(relativePath);
      return relativePath;
    },
    readFile: async source => Buffer.from(source),
    store: async (category, buffer) => ({
      path: `/media/${category}/${buffer.toString().includes('CN_light') ? 'cn' : 'default'}.webp`
    }),
    now: () => new Date('2026-08-30T00:00:00.000Z')
  });

  assert.deepEqual(sources, ['icons/areas/CN_light.png', 'icons/OWCS_Dark.png']);
  assert.deepEqual(updated, [
    { id: 7, icon: '/media/seasons/cn.webp' },
    { id: 9, icon: '/media/seasons/default.webp' }
  ]);
  assert.deepEqual(result, { alreadyApplied: false, migrated: 2, skipped: 1, failed: 0, errors: [] });
  assert.equal(markerPayload.key, MIGRATION_KEY);
  assert.equal(markerPayload.value.completed, true);
  assert.equal(markerPayload.value.completedAt, '2026-08-30T00:00:00.000Z');
});

test('does not revisit season rows after the migration marker is complete', async () => {
  const result = await migrateLegacySeasonIcons({
    configModel: { findByPk: async () => ({ value: { completed: true } }) },
    seasonModel: { findAll: async () => assert.fail('season rows should not be queried') }
  });
  assert.deepEqual(result, { alreadyApplied: true, migrated: 0, skipped: 0, failed: 0 });
});
