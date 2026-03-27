const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SeasonMapPickStat = sequelize.define('SeasonMapPickStat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  seasonId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  mapId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  mapName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mapType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  pickCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'season_map_pick_stats',
  timestamps: false
});

module.exports = SeasonMapPickStat;
