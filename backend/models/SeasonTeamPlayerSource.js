const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SeasonTeamPlayer = require('./SeasonTeamPlayer');

const SeasonTeamPlayerSource = sequelize.define('SeasonTeamPlayerSource', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  seasonTeamPlayerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: SeasonTeamPlayer, key: 'id' },
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
  tableName: 'season_team_player_sources',
  timestamps: false,
  indexes: [
    {
      name: 'uq_season_team_player_source',
      unique: true,
      fields: ['seasonTeamPlayerId', 'sourceType', 'sourceKey']
    },
    {
      name: 'idx_season_team_player_source_lookup',
      fields: ['sourceType', 'sourceKey', 'active']
    }
  ]
});

module.exports = SeasonTeamPlayerSource;
