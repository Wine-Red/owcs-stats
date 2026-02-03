const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Season = sequelize.define('Season', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  status: {
    type: DataTypes.ENUM('in_progress', 'completed'),
    allowNull: false,
    defaultValue: 'in_progress'
  }
}, {
  tableName: 'seasons',
  timestamps: false
});

module.exports = Season;