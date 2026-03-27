const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SeasonTeamScoreStat = sequelize.define('SeasonTeamScoreStat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  seasonId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  teamId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  teamName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  teamShortName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  matchWin: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  matchLoss: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  matchDiff: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  mapWin: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  mapLoss: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  mapDiff: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'season_team_score_stats',
  timestamps: false
});

module.exports = SeasonTeamScoreStat;
