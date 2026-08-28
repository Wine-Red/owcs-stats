const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Player = sequelize.define('Player', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('tank', 'damage', 'support'),
    allowNull: false
  },
  identityOrigin: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'legacy',
    comment: 'legacy/manual/match; controls cautious orphan cleanup'
  },
  orphanedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'First time this identity was confirmed to have no references'
  }
}, {
  tableName: 'players',
  timestamps: false
});

module.exports = Player;
