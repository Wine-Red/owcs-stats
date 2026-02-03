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