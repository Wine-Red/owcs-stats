const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TeamAlias = sequelize.define('TeamAlias', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  teamId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'teams',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  alias: {
    type: DataTypes.STRING(191),
    allowNull: false
  },
  normalizedAlias: {
    type: DataTypes.STRING(191),
    allowNull: false,
    unique: true
  }
}, {
  tableName: 'team_aliases',
  timestamps: false,
  indexes: [
    { fields: ['teamId'] }
  ]
});

module.exports = TeamAlias;
