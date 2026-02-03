const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const MapGame = require('./MapGame');
const Player = require('./Player');
const Hero = require('./Hero');
const Team = require('./Team');

const PlayerStat = sequelize.define('PlayerStat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  mapGameId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: MapGame,
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
  heroId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Hero,
      key: 'id'
    }
  },
  teamId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Team,
      key: 'id'
    }
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

// 关联关系
PlayerStat.belongsTo(MapGame, { foreignKey: 'mapGameId' });
PlayerStat.belongsTo(Player, { foreignKey: 'playerId' });
PlayerStat.belongsTo(Hero, { foreignKey: 'heroId' });
PlayerStat.belongsTo(Team, { foreignKey: 'teamId' });

module.exports = PlayerStat;