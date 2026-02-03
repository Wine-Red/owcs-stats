const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Match = require('./Match');
const Map = require('./Map');
const Team = require('./Team');
const Hero = require('./Hero');

const MapGame = sequelize.define('MapGame', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  matchId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Match,
      key: 'id'
    }
  },
  mapId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Map,
      key: 'id'
    }
  },
  winnerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Team,
      key: 'id'
    }
  },
  team1BanHeroId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Hero,
      key: 'id'
    }
  },
  team2BanHeroId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Hero,
      key: 'id'
    }
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false, // 分钟
    defaultValue: 0
  }
}, {
  tableName: 'map_games',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// 关联关系
MapGame.belongsTo(Match, { foreignKey: 'matchId' });
MapGame.belongsTo(Map, { foreignKey: 'mapId' });
MapGame.belongsTo(Team, { as: 'winner', foreignKey: 'winnerId' });
MapGame.belongsTo(Hero, { as: 'team1BanHero', foreignKey: 'team1BanHeroId' });
MapGame.belongsTo(Hero, { as: 'team2BanHero', foreignKey: 'team2BanHeroId' });

module.exports = MapGame;