const { DataTypes } = require('sequelize');

const ensureTeamLiquipediaSchema = async sequelize => {
  const query = sequelize.getQueryInterface();
  const tables = await query.showAllTables();
  if (!tables.some(table => String(typeof table === 'string' ? table : table.tableName || table.name).toLowerCase() === 'teams')) return;
  const columns = await query.describeTable('teams');
  if (!columns.liquipediaUrl) {
    await query.addColumn('teams', 'liquipediaUrl', { type: DataTypes.STRING(1024), allowNull: true });
  }
};

module.exports = { ensureTeamLiquipediaSchema };
