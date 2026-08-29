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
  stage: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  },
  status: {
    type: DataTypes.ENUM('in_progress', 'completed'),
    allowNull: false,
    defaultValue: 'in_progress'
  },
  externalEventName: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '关联的外部API事件名称，如 OWCSCNS1'
  },
  icon: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Managed season icon path'
  }
}, {
  tableName: 'seasons',
  timestamps: false
});

module.exports = Season;
