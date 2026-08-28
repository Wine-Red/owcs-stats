const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SeasonTeam = require('./SeasonTeam');

const SeasonTeamSource = sequelize.define('SeasonTeamSource', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  seasonTeamId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: SeasonTeam, key: 'id' },
    onDelete: 'CASCADE'
  },
  sourceType: {
    type: DataTypes.STRING(32),
    allowNull: false
  },
  sourceKey: {
    type: DataTypes.STRING(191),
    allowNull: false
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  firstSeenAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  lastSeenAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'season_team_sources',
  timestamps: false,
  indexes: [
    {
      name: 'uq_season_team_source',
      unique: true,
      fields: ['seasonTeamId', 'sourceType', 'sourceKey']
    },
    {
      name: 'idx_season_team_source_lookup',
      fields: ['sourceType', 'sourceKey', 'active']
    }
  ]
});

module.exports = SeasonTeamSource;
