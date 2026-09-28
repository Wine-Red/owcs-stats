const { DataTypes } = require('sequelize');

const defineTournamentSnapshot = (database, { tableName = 'tournament_snapshots' } = {}) => database.define('TournamentSnapshot', {
  sourceKey: { type: DataTypes.STRING(64), primaryKey: true },
  page: { type: DataTypes.STRING(250), allowNull: false },
  sourceUrl: { type: DataTypes.STRING(1024), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: true },
  contentHash: { type: DataTypes.STRING(64), allowNull: true },
  lastAttemptAt: { type: DataTypes.DATE(3), allowNull: true },
  lastSuccessAt: { type: DataTypes.DATE(3), allowNull: true },
  nextSyncAt: { type: DataTypes.DATE(3), allowNull: true },
  failureCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastError: { type: DataTypes.TEXT, allowNull: true },
  syncToken: { type: DataTypes.STRING(36), allowNull: true },
  leaseUntil: { type: DataTypes.DATE(3), allowNull: true }
}, { tableName, timestamps: true, indexes: [{ fields: ['nextSyncAt'] }] });

module.exports = { defineTournamentSnapshot };
