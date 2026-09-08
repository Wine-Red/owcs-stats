const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// One durable desired state per source match. Applied rows retain the version watermark.
module.exports = sequelize.define('ExternalMatchInbox', {
  externalId: { type: DataTypes.STRING(160), primaryKey: true },
  sourceUpdatedAt: { type: DataTypes.STRING(40), allowNull: false },
  operation: { type: DataTypes.STRING(10), allowNull: false },
  status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'pending' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextAttemptAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lastError: { type: DataTypes.TEXT, allowNull: true },
  appliedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'external_match_inbox',
  timestamps: true,
  indexes: [{ fields: ['status', 'nextAttemptAt'] }]
});
