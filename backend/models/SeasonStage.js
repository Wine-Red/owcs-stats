const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SeasonStage = sequelize.define('SeasonStage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  seasonId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // null 表示从赛季第一场比赛开始；其余阶段从选中的比赛（含）开始。
  startMatchId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'season_stages',
  timestamps: true,
  indexes: [
    { fields: ['seasonId'] },
    { unique: true, fields: ['seasonId', 'startMatchId'] }
  ]
});

module.exports = SeasonStage;
