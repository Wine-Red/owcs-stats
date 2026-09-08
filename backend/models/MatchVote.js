const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const MatchPoll = require('./MatchPoll');

const VoteVisitor = sequelize.define('VoteVisitor', {
  tokenHash: { type: DataTypes.STRING(64), primaryKey: true }
}, { tableName: 'vote_visitors', updatedAt: false });

const MatchVote = sequelize.define('MatchVote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  pollId: { type: DataTypes.INTEGER, allowNull: false, references: { model: MatchPoll, key: 'id' }, onDelete: 'CASCADE' },
  voterHash: { type: DataTypes.STRING(64), allowNull: false },
  teamId: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'match_votes', indexes: [{ unique: true, fields: ['pollId', 'voterHash'], name: 'one_vote_per_visitor' }] });

module.exports = { MatchVote, VoteVisitor };
