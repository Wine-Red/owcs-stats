const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Player = require('./Player');

const id = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };
const playerId = { type: DataTypes.INTEGER, allowNull: false,
  references: { model: Player, key: 'id' }, onDelete: 'RESTRICT' };
const PlayerAlias = sequelize.define('PlayerAlias', {
  id, playerId, alias: { type: DataTypes.STRING(191), allowNull: false },
  normalizedAlias: { type: DataTypes.STRING(191), allowNull: false }
}, { tableName: 'player_aliases', timestamps: false,
  indexes: [{ unique: true, fields: ['playerId', 'normalizedAlias'] }, { fields: ['normalizedAlias'] }] });

const PlayerExternalIdentity = sequelize.define('PlayerExternalIdentity', {
  id, playerId, source: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'matchweb' },
  externalId: { type: DataTypes.STRING(160), allowNull: false },
  normalizedExternalId: { type: DataTypes.STRING(160), allowNull: false }
}, { tableName: 'player_external_identities', timestamps: false,
  indexes: [{ unique: true, fields: ['source', 'normalizedExternalId'], name: 'uq_player_source_identity' }] });

const EntityRedirect = sequelize.define('EntityRedirect', {
  id, kind: { type: DataTypes.STRING(16), allowNull: false },
  sourceId: { type: DataTypes.INTEGER, allowNull: false },
  targetId: { type: DataTypes.INTEGER, allowNull: false },
  sourceName: { type: DataTypes.STRING, allowNull: false },
  protectedAliases: { type: DataTypes.JSON, allowNull: false }
}, { tableName: 'entity_redirects', timestamps: false,
  indexes: [{ unique: true, fields: ['kind', 'sourceId'] }, { fields: ['kind', 'targetId'] }] });

const EntityMergeAudit = sequelize.define('EntityMergeAudit', {
  id, kind: { type: DataTypes.STRING(16), allowNull: false },
  sourceId: { type: DataTypes.INTEGER, allowNull: false },
  targetId: { type: DataTypes.INTEGER, allowNull: false },
  fingerprint: { type: DataTypes.STRING(64), allowNull: false },
  before: { type: DataTypes.JSON, allowNull: false },
  summary: { type: DataTypes.JSON, allowNull: false }
}, { tableName: 'entity_merge_audits', updatedAt: false });

const IdentityWriteLock = sequelize.define('IdentityWriteLock', {
  id: { type: DataTypes.INTEGER, primaryKey: true }
}, { tableName: 'identity_write_locks', timestamps: false });

module.exports = { PlayerAlias, PlayerExternalIdentity, EntityRedirect, EntityMergeAudit, IdentityWriteLock };
