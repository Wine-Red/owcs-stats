const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Season = require('./Season');
const Team = require('./Team');

const Match = sequelize.define('Match', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  seasonId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Season,
      key: 'id'
    }
  },
  team1Id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Team,
      key: 'id'
    }
  },
  team2Id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Team,
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
  matchDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  externalId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: '外部API的比赛唯一ID'
  },
  boFormat: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '比赛赛制，如 BO5'
  },
  team1Score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: '队伍1大场得分'
  },
  team2Score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: '队伍2大场得分'
  }
}, {
  tableName: 'matches',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

// 关联关系
Match.belongsTo(Season, { foreignKey: 'seasonId' });
Match.belongsTo(Team, { as: 'team1', foreignKey: 'team1Id' });
Match.belongsTo(Team, { as: 'team2', foreignKey: 'team2Id' });
Match.belongsTo(Team, { as: 'winner', foreignKey: 'winnerId' });

module.exports = Match;