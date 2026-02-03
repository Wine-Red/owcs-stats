const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const SeasonTeam = require('./SeasonTeam');
const Player = require('./Player');

const SeasonTeamPlayer = sequelize.define('SeasonTeamPlayer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  seasonTeamId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: SeasonTeam,
      key: 'id'
    }
  },
  playerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Player,
      key: 'id'
    }
  },
  joinDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  leaveDate: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'season_team_players',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['seasonTeamId', 'playerId']
    }
  ]
});

// 关联关系
SeasonTeam.hasMany(SeasonTeamPlayer, {
  foreignKey: 'seasonTeamId',
  as: 'players'
});

SeasonTeamPlayer.belongsTo(SeasonTeam, {
  foreignKey: 'seasonTeamId'
});

SeasonTeamPlayer.belongsTo(Player, {
  foreignKey: 'playerId'
});

Player.hasMany(SeasonTeamPlayer, {
  foreignKey: 'playerId',
  as: 'seasonTeams'
});

module.exports = SeasonTeamPlayer;