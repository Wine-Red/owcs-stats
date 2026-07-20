const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const PlayerStat = require('./PlayerStat');
const Hero = require('./Hero');

const PlayerHeroStat = sequelize.define('PlayerHeroStat', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  playerStatId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: PlayerStat, key: 'id' },
    onDelete: 'CASCADE'
  },
  heroId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: Hero, key: 'id' },
    onDelete: 'SET NULL'
  },
  heroName: { type: DataTypes.STRING, allowNull: false },
  usageSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  usagePercentage: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  finalBlows: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  deathsByFinalBlow: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  ultReady: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  ultUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  avgUltChargeSeconds: { type: DataTypes.FLOAT, allowNull: true }
}, {
  tableName: 'player_hero_stats',
  timestamps: false,
  indexes: [{ unique: true, fields: ['playerStatId', 'heroName'] }]
});

PlayerHeroStat.belongsTo(PlayerStat, { foreignKey: 'playerStatId', onDelete: 'CASCADE' });
PlayerHeroStat.belongsTo(Hero, { foreignKey: 'heroId', as: 'hero', onDelete: 'SET NULL' });

module.exports = PlayerHeroStat;
