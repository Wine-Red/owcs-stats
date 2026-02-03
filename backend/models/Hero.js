const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Hero = sequelize.define('Hero', {
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
  role: {
    type: DataTypes.ENUM('tank', 'damage', 'support'),
    allowNull: false
  }
}, {
  tableName: 'heroes',
  timestamps: false
});

module.exports = Hero;