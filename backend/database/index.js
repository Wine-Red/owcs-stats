const sequelize = require('../config/database');
const Team = require('../models/Team'); // eslint-disable-line no-unused-vars
const TeamAlias = require('../models/TeamAlias'); // eslint-disable-line no-unused-vars
const SeasonTeam = require('../models/SeasonTeam'); // eslint-disable-line no-unused-vars
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer'); // eslint-disable-line no-unused-vars
const SeasonTeamSource = require('../models/SeasonTeamSource'); // eslint-disable-line no-unused-vars
const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource'); // eslint-disable-line no-unused-vars
const Player = require('../models/Player'); // eslint-disable-line no-unused-vars
const Map = require('../models/Map');
const Hero = require('../models/Hero');
const Match = require('../models/Match'); // eslint-disable-line no-unused-vars
const MapGame = require('../models/MapGame'); // eslint-disable-line no-unused-vars
const PlayerStat = require('../models/PlayerStat'); // eslint-disable-line no-unused-vars
const PlayerHeroStat = require('../models/PlayerHeroStat'); // eslint-disable-line no-unused-vars
const MapGameTimeline = require('../models/MapGameTimeline'); // eslint-disable-line no-unused-vars
const SeasonStage = require('../models/SeasonStage'); // eslint-disable-line no-unused-vars
const Config = require('../models/Config'); // eslint-disable-line no-unused-vars
const { migrateLegacySeasonIcons } = require('./seasonIconMigration');
const { ensureAgentViews } = require('./agentViews');
const { migrateLegacyTeamNameMapping } = require('./teamAliasMigration');
const { runMembershipEvidenceMigration } = require('./membershipEvidenceMigration');

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
  if (!columns.externalRoundIndex) {
    const { DataTypes } = require('sequelize');
    await queryInterface.addColumn('map_games', 'externalRoundIndex', {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Stable zero-based MatchWeb round index; supports repeated map names'
    });
  }
};

const ensureMediaSchema = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = (await queryInterface.showAllTables()).map(lowerTableName);
  const { DataTypes } = require('sequelize');

  if (tables.includes('seasons')) {
    const columns = await queryInterface.describeTable('seasons');
    if (!columns.icon) {
      await queryInterface.addColumn('seasons', 'icon', {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Managed season icon path'
      });
    }
  }

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

const ensureTimelineAggregationSchema = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = (await queryInterface.showAllTables()).map(lowerTableName);
  const { DataTypes } = require('sequelize');
  if (tables.includes('heroes')) {
    const columns = await queryInterface.describeTable('heroes');
    if (!columns.externalId) {
      await queryInterface.addColumn('heroes', 'externalId', {
        type: DataTypes.STRING(80), allowNull: true, unique: true,
        comment: 'Stable OWCS analyzer hero slug'
      });
    }
  }
  if (tables.includes('player_hero_stats')) {
    const columns = await queryInterface.describeTable('player_hero_stats');
    if (!columns.heroExternalId) {
      await queryInterface.addColumn('player_hero_stats', 'heroExternalId', {
        type: DataTypes.STRING(80), allowNull: true
      });
    }
  }
};

const ensureMembershipSourceSchema = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = (await queryInterface.showAllTables()).map(lowerTableName);
  if (!tables.includes('players')) return;
  const { DataTypes } = require('sequelize');
  const columns = await queryInterface.describeTable('players');
  if (!columns.externalId) {
    await queryInterface.addColumn('players', 'externalId', {
      type: DataTypes.STRING(160),
      allowNull: true,
      unique: true,
      comment: 'Authoritative MatchWeb playerId'
    });
  }
  if (!columns.identityOrigin) {
    await queryInterface.addColumn('players', 'identityOrigin', {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'legacy',
      comment: 'legacy/manual/match; controls cautious orphan cleanup'
    });
  }
  if (!columns.orphanedAt) {
    await queryInterface.addColumn('players', 'orphanedAt', {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'First time this identity was confirmed to have no references'
    });
  }
};

const initDatabase = async () => {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    await ensureIncrementalSyncSchema();
    await ensureTimelineAggregationSchema();
    await ensureMediaSchema();
    await ensureMembershipSourceSchema();
    console.log('数据库连接成功');

    // 设置模型关联关系
    setupAssociations();

    // 避免 MySQL 在长期运行中反复 alter 表结构，导致索引数量失控
    await sequelize.sync();
    console.log('数据库模型同步成功');

    const seasonIconMigration = await migrateLegacySeasonIcons();
    console.log(
      `[season-icons] ${seasonIconMigration.alreadyApplied ? 'already-applied' : 'migration-checked'} ` +
      `migrated=${seasonIconMigration.migrated} skipped=${seasonIconMigration.skipped} failed=${seasonIconMigration.failed}`
    );

    const aliasMigration = await migrateLegacyTeamNameMapping(sequelize);
    if (aliasMigration.found) {
      console.log(`[team-aliases] migrated=${aliasMigration.migrated} skipped=${aliasMigration.skipped} failures=${aliasMigration.failures.length}`);
    }

    const membershipMigration = await runMembershipEvidenceMigration(sequelize);
    console.log(
      `[membership-evidence] baseline=${membershipMigration.found ? 'existing' : 'created'} ` +
      `matchTeams=${membershipMigration.matchTeamSources || 0} ` +
      `matchPlayers=${membershipMigration.matchPlayerSources || 0} ` +
      `legacyTeams=${membershipMigration.legacyTeamSources || 0} ` +
      `legacyPlayers=${membershipMigration.legacyPlayerSources || 0} ` +
      `anomalies=${membershipMigration.anomalyCount || 0}`
    );

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
  const TeamAlias = require('../models/TeamAlias');
  const SeasonTeam = require('../models/SeasonTeam'); // eslint-disable-line no-unused-vars
  const SeasonTeamPlayer = require('../models/SeasonTeamPlayer'); // eslint-disable-line no-unused-vars
  const SeasonTeamSource = require('../models/SeasonTeamSource');
  const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource');
  const Player = require('../models/Player');
  const Hero = require('../models/Hero');
  const Match = require('../models/Match'); // eslint-disable-line no-unused-vars
  const MapGame = require('../models/MapGame');
  const PlayerStat = require('../models/PlayerStat');
  const PlayerHeroStat = require('../models/PlayerHeroStat');
  const MapGameTimeline = require('../models/MapGameTimeline');
  const SeasonStage = require('../models/SeasonStage');

  Team.hasMany(TeamAlias, { foreignKey: 'teamId', as: 'aliasRecords', onDelete: 'CASCADE' });
  TeamAlias.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

  SeasonTeam.hasMany(SeasonTeamSource, {
    foreignKey: 'seasonTeamId',
    as: 'sources',
    onDelete: 'CASCADE'
  });
  SeasonTeamSource.belongsTo(SeasonTeam, { foreignKey: 'seasonTeamId', as: 'seasonTeam' });
  SeasonTeamPlayer.hasMany(SeasonTeamPlayerSource, {
    foreignKey: 'seasonTeamPlayerId',
    as: 'sources',
    onDelete: 'CASCADE'
  });
  SeasonTeamPlayerSource.belongsTo(SeasonTeamPlayer, {
    foreignKey: 'seasonTeamPlayerId',
    as: 'seasonTeamPlayer'
  });

  // PlayerStat 关联
  PlayerStat.belongsTo(MapGame, { foreignKey: 'mapGameId' });
  PlayerStat.belongsTo(Player, { foreignKey: 'playerId', as: 'player' });
  PlayerStat.belongsTo(Hero, { foreignKey: 'heroId', as: 'hero' });
  PlayerStat.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

  // MapGame 关联
  MapGame.hasMany(PlayerStat, { foreignKey: 'mapGameId', as: 'playerStats' });
  MapGame.hasOne(MapGameTimeline, { foreignKey: 'mapGameId', as: 'timeline', onDelete: 'CASCADE' });
  PlayerStat.hasMany(PlayerHeroStat, { foreignKey: 'playerStatId', as: 'heroStats', onDelete: 'CASCADE' });

  SeasonStage.belongsTo(Season, { foreignKey: 'seasonId', as: 'season' });
  Season.hasMany(SeasonStage, { foreignKey: 'seasonId', as: 'stages' });
  SeasonStage.belongsTo(Match, {
    foreignKey: 'startMatchId',
    as: 'startMatch',
    onDelete: 'RESTRICT'
  });
};

module.exports = { initDatabase, ensureMediaSchema, ensureMembershipSourceSchema };
