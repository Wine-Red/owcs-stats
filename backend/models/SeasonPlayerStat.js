const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SeasonPlayerStat = sequelize.define('SeasonPlayerStat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  seasonId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  playerId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  teamId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  playerName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  teamName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING,
    allowNull: true
  },
  elims: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  assists: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  deaths: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  damage: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  healing: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  mitigation: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  gameTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  kd: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  kad: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  elimsPerMin: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  assistsPerMin: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  deathsPerMin: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  damagePerMin: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  mitigationPerMin: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  healingPerMin: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  }
}, {
  tableName: 'season_player_stats',
  timestamps: true 
});

module.exports = SeasonPlayerStat;
