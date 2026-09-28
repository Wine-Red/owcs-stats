const { DataTypes } = require('sequelize');

const ensureTeamLiquipediaSchema = async (sequelize, { tableName = 'teams' } = {}) => {
  const query = sequelize.getQueryInterface();
  const tables = await query.showAllTables();
  if (!tables.some(table => String(typeof table === 'string' ? table : table.tableName || table.name).toLowerCase() === tableName.toLowerCase())) return;
  const columns = await query.describeTable(tableName);
  if (!columns.liquipediaUrl) {
    await query.addColumn(tableName, 'liquipediaUrl', { type: DataTypes.STRING(1024), allowNull: true });
  }
  if (!columns.liquipediaUrls) {
    await query.addColumn(tableName, 'liquipediaUrls', { type: DataTypes.JSON, allowNull: true });
  }
};

module.exports = { ensureTeamLiquipediaSchema };
