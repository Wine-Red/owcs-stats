const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PlayerStat = sequelize.define('PlayerStat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  mapGameId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  playerId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  heroId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  teamId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  kills: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  deaths: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  assists: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  damage: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  healing: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  mitigation: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  ultsUsed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  finalBlows: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'player_stats',
  timestamps: false
});

module.exports = PlayerStat;