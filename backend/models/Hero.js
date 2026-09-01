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
  externalId: {
    type: DataTypes.STRING(80),
    allowNull: true,
    unique: true,
    comment: 'Stable OWCS analyzer hero slug'
  },
  role: {
    type: DataTypes.ENUM('tank', 'damage', 'support'),
    allowNull: false
  },
  subRole: {
    type: DataTypes.STRING,
    allowNull: true
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'heroes',
  timestamps: false
});

module.exports = Hero;
