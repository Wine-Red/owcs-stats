const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Season = require('./Season');
const Team = require('./Team');

const SeasonTeam = sequelize.define('SeasonTeam', {
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
  teamId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Team,
      key: 'id'
    }
  }
}, {
  tableName: 'season_teams',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['seasonId', 'teamId']
    }
  ]
});

// 关联关系
Season.belongsToMany(Team, {
  through: SeasonTeam,
  foreignKey: 'seasonId',
  otherKey: 'teamId'
});

Team.belongsToMany(Season, {
  through: SeasonTeam,
  foreignKey: 'teamId',
  otherKey: 'seasonId'
});

// 定义SeasonTeam与Season、Team的关联关系
SeasonTeam.belongsTo(Season, {
  foreignKey: 'seasonId',
  as: 'Season'
});

SeasonTeam.belongsTo(Team, {
  foreignKey: 'teamId',
  as: 'Team'
});

module.exports = SeasonTeam;