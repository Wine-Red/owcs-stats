const sequelize = require('../config/database');
const Team = require('../models/Team'); // eslint-disable-line no-unused-vars
const SeasonTeam = require('../models/SeasonTeam'); // eslint-disable-line no-unused-vars
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer'); // eslint-disable-line no-unused-vars
const Player = require('../models/Player'); // eslint-disable-line no-unused-vars
const Map = require('../models/Map');
const Hero = require('../models/Hero');
const Match = require('../models/Match'); // eslint-disable-line no-unused-vars
const MapGame = require('../models/MapGame'); // eslint-disable-line no-unused-vars
const PlayerStat = require('../models/PlayerStat'); // eslint-disable-line no-unused-vars
const PlayerHeroStat = require('../models/PlayerHeroStat'); // eslint-disable-line no-unused-vars
const SeasonStage = require('../models/SeasonStage'); // eslint-disable-line no-unused-vars
const Config = require('../models/Config'); // eslint-disable-line no-unused-vars
const { ensureAgentViews } = require('./agentViews');

const lowerTableName = table => {
  if (typeof table === 'string') return table.toLowerCase();
  return String(table?.tableName || table?.name || '').toLowerCase();
};

const ensureIncrementalSyncSchema = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  if (!tables.map(lowerTableName).includes('map_games')) return;
  const columns = await queryInterface.describeTable('map_games');
  if (!columns.statsVersion) {
    const { DataTypes } = require('sequelize');
    await queryInterface.addColumn('map_games', 'statsVersion', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'External match statistics schema version'
    });
  }
};

const ensureMediaSchema = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = (await queryInterface.showAllTables()).map(lowerTableName);
  const { DataTypes } = require('sequelize');

  for (const tableName of ['heroes', 'maps']) {
    if (!tables.includes(tableName)) continue;
    const columns = await queryInterface.describeTable(tableName);
    if (!columns.image) {
      await queryInterface.addColumn(tableName, 'image', {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Managed media path'
      });
    }
  }
};

const initDatabase = async () => {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    await ensureIncrementalSyncSchema();
    await ensureMediaSchema();
    console.log('数据库连接成功');

    // 设置模型关联关系
    setupAssociations();

    // 避免 MySQL 在长期运行中反复 alter 表结构，导致索引数量失控
    await sequelize.sync();
    console.log('数据库模型同步成功');

    // Keep the assistant-facing views aligned with the deployed backend while
    // allowing the website to start if this account lacks CREATE VIEW rights.
    try {
      const viewCount = await ensureAgentViews(sequelize);
      console.log(`[agent-views] ${viewCount} views are ready`);
    } catch (error) {
      console.error(`[agent-views] initialization failed; website startup will continue: ${error.message}`);
    }

    // 英雄和地图改由后台管理，不再在应用启动时写入或修正固定数据。
  } catch (error) {
    console.error('数据库初始化失败:', error);
    process.exit(1);
  }
};

const setupAssociations = () => {
  const Season = require('../models/Season');
  const Team = require('../models/Team');
  const SeasonTeam = require('../models/SeasonTeam'); // eslint-disable-line no-unused-vars
  const SeasonTeamPlayer = require('../models/SeasonTeamPlayer'); // eslint-disable-line no-unused-vars
  const Player = require('../models/Player');
  const Hero = require('../models/Hero');
  const Match = require('../models/Match'); // eslint-disable-line no-unused-vars
  const MapGame = require('../models/MapGame');
  const PlayerStat = require('../models/PlayerStat');
  const PlayerHeroStat = require('../models/PlayerHeroStat');
  const SeasonStage = require('../models/SeasonStage');

  // PlayerStat 关联
  PlayerStat.belongsTo(MapGame, { foreignKey: 'mapGameId' });
  PlayerStat.belongsTo(Player, { foreignKey: 'playerId', as: 'player' });
  PlayerStat.belongsTo(Hero, { foreignKey: 'heroId', as: 'hero' });
  PlayerStat.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

  // MapGame 关联
  MapGame.hasMany(PlayerStat, { foreignKey: 'mapGameId', as: 'playerStats' });
  PlayerStat.hasMany(PlayerHeroStat, { foreignKey: 'playerStatId', as: 'heroStats', onDelete: 'CASCADE' });

  SeasonStage.belongsTo(Season, { foreignKey: 'seasonId', as: 'season' });
  Season.hasMany(SeasonStage, { foreignKey: 'seasonId', as: 'stages' });
  SeasonStage.belongsTo(Match, {
    foreignKey: 'startMatchId',
    as: 'startMatch',
    onDelete: 'RESTRICT'
  });
};

module.exports = { initDatabase, ensureMediaSchema };
