const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SeasonStageSnapshot = sequelize.define('SeasonStageSnapshot', {
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
  }
}, {
  tableName: 'season_stage_snapshots',
  timestamps: true
});

module.exports = SeasonStageSnapshot;

