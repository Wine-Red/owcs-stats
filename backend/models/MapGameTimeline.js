const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const MapGame = require('./MapGame');

/** One lossless mirror of MatchWeb's canonical raw timeline per map game. */
const MapGameTimeline = sequelize.define('MapGameTimeline', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  mapGameId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: MapGame, key: 'id' },
    onDelete: 'CASCADE'
  },
  schemaVersion: { type: DataTypes.INTEGER, allowNull: false },
  revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  digest: { type: DataTypes.STRING(64), allowNull: false },
  sourceTaskId: { type: DataTypes.STRING(160), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
  sourceUpdatedAt: { type: DataTypes.DATE, allowNull: true },
  syncedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  tableName: 'map_game_timelines',
  timestamps: false
});

MapGameTimeline.belongsTo(MapGame, { foreignKey: 'mapGameId', onDelete: 'CASCADE' });

module.exports = MapGameTimeline;
