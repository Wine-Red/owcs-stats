const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Map = sequelize.define('Map', {
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
  type: {
    type: DataTypes.ENUM('推进', '护送', '控制', '混合', '闪点'),
    allowNull: false
  }
}, {
  tableName: 'maps',
  timestamps: false
});

module.exports = Map;