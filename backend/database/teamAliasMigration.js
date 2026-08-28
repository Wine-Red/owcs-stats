const Config = require('../models/Config');
const Team = require('../models/Team');
const TeamAlias = require('../models/TeamAlias');
const { normalizeTeamIdentity, buildTeamIdentityMap } = require('../services/TeamAliasService');

const LEGACY_MAPPING_KEY = 'team_name_mapping';
const MIGRATION_AUDIT_KEY = 'team_alias_migration_v1';

const migrateLegacyTeamNameMapping = async sequelize => sequelize.transaction(async transaction => {
  const config = await Config.findByPk(LEGACY_MAPPING_KEY, { transaction });
  if (!config?.value || typeof config.value !== 'object' || Array.isArray(config.value)) {
    return { found: false, migrated: 0 };
  }

  const [teams, aliases] = await Promise.all([
    Team.findAll({ transaction }),
    TeamAlias.findAll({ transaction })
  ]);
  const teamsByMainName = new Map(teams.map(team => [normalizeTeamIdentity(team.name), team]));
  const identityMap = buildTeamIdentityMap(teams, aliases);
  const migrated = [];
  const skipped = [];
  const failures = [];

  for (const [rawAlias, canonicalName] of Object.entries(config.value)) {
    const alias = String(rawAlias || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const target = teamsByMainName.get(normalizeTeamIdentity(canonicalName));
    if (!alias || !target) {
      failures.push({ alias, canonicalName, reason: target ? '别名为空' : '找不到目标队伍主名' });
      continue;
    }
    const aliasKey = normalizeTeamIdentity(alias);
    const current = identityMap.get(aliasKey);
    if (current && Number(current.id) !== Number(target.id)) {
      failures.push({ alias, canonicalName, reason: `名称已属于队伍 ${current.name}` });
      continue;
    }
    if (current || aliasKey === normalizeTeamIdentity(target.name)) {
      skipped.push({ alias, canonicalName: target.name, reason: '已存在' });
      continue;
    }
    await TeamAlias.create({
      teamId: target.id,
      alias,
      normalizedAlias: aliasKey
    }, { transaction });
    identityMap.set(aliasKey, target);
    migrated.push({ alias, canonicalName: target.name, teamId: target.id });
  }

  const auditValue = {
    source: config.value,
    migrated,
    skipped,
    failures,
    migratedAt: new Date().toISOString()
  };
  const [audit] = await Config.findOrCreate({
    where: { key: MIGRATION_AUDIT_KEY },
    defaults: {
      value: auditValue,
      description: 'Legacy team name mapping migration audit'
    },
    transaction
  });
  audit.value = auditValue;
  audit.changed('value', true);
  await audit.save({ transaction });

  if (!failures.length) await config.destroy({ transaction });
  return { found: true, migrated: migrated.length, skipped: skipped.length, failures };
});

module.exports = {
  LEGACY_MAPPING_KEY,
  MIGRATION_AUDIT_KEY,
  migrateLegacyTeamNameMapping
};
