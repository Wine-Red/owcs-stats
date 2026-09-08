const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Match = require('./Match');

const MatchPoll = sequelize.define('MatchPoll', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sourceId: { type: DataTypes.STRING(191), allowNull: false },
  sourcePage: { type: DataTypes.STRING(255), allowNull: false },
  sourceGroup: { type: DataTypes.STRING(80), allowNull: false },
  pairKey: { type: DataTypes.STRING(60), allowNull: false },
  seasonId: { type: DataTypes.INTEGER, allowNull: false },
  team1Id: { type: DataTypes.INTEGER, allowNull: false },
  team2Id: { type: DataTypes.INTEGER, allowNull: false },
  scheduledAt: { type: DataTypes.DATE, allowNull: false },
  matchId: { type: DataTypes.INTEGER, allowNull: true, unique: true,
    references: { model: Match, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' }
}, { tableName: 'match_polls', indexes: [
  { unique: true, fields: ['sourceId', 'pairKey'], name: 'poll_source_pair_unique' },
  { fields: ['seasonId'] }
] });
module.exports = MatchPoll;
