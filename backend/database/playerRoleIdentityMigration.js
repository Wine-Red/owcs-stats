const { DataTypes } = require('sequelize');

// Run before model sync: old global unique indexes prevent one source player
// from having independent records for multiple competitive roles.
const ensurePlayerRoleIdentitySchema = async sequelize => {
  const qi = sequelize.getQueryInterface();
  const tables = (await qi.showAllTables()).map(t => typeof t === 'string' ? t : t.tableName);
  if (tables.includes('player_external_identities')) {
    const columns = await qi.describeTable('player_external_identities');
    if (!columns.role) await qi.addColumn('player_external_identities', 'role', {
      type: DataTypes.ENUM('tank', 'damage', 'support'), allowNull: true
    });
    await sequelize.query('UPDATE player_external_identities i JOIN players p ON p.id = i.playerId SET i.role = p.role WHERE i.role IS NULL');
    if (!columns.role || columns.role.allowNull) {
      await qi.changeColumn('player_external_identities', 'role', {
        type: DataTypes.ENUM('tank', 'damage', 'support'), allowNull: false
      });
    }
  }
  for (const [table, fields, name, oldFields] of [
    ['players', ['externalId', 'role'], 'uq_player_external_role', ['externalId']],
    ['player_external_identities', ['source', 'normalizedExternalId', 'role'], 'uq_player_source_role_identity', ['source', 'normalizedExternalId']]
  ]) {
    if (!tables.includes(table)) continue;
    const indexes = await qi.showIndex(table);
    if (!indexes.some(i => i.name === name)) await qi.addIndex(table, fields, { name, unique: true });
    for (const index of indexes) {
      const names = index.fields.map(f => f.attribute);
      if (index.unique && names.length === oldFields.length && oldFields.every(f => names.includes(f))) {
        await qi.removeIndex(table, index.name);
      }
    }
  }
};

module.exports = { ensurePlayerRoleIdentitySchema };
