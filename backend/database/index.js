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

const initDatabase = async () => {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    await ensureIncrementalSyncSchema();
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

    // 初始化基础数据
    await initBasicData();
    console.log('基础数据初始化成功');
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

const initBasicData = async () => {
  // 初始化地图数据
  const maps = [
    // 攻击/护送地图
    { name: '艾兴瓦尔德', type: '攻击/护送' },
    { name: '暴雪世界', type: '攻击/护送' },
    { name: '好莱坞', type: '攻击/护送' },
    { name: '国王大道', type: '攻击/护送' },
    { name: '努巴尼', type: '攻击/护送' },
    { name: '帕拉伊苏', type: '攻击/护送' },
    { name: '中城', type: '攻击/护送' },
    { name: '霓虹枢纽', type: '攻击/护送' },
    // 运载目标地图
    { name: '监测站：直布罗陀', type: '运载目标' },
    { name: '多拉多', type: '运载目标' },
    { name: '哈瓦那', type: '运载目标' },
    { name: '里阿尔托', type: '运载目标' },
    { name: '66号公路', type: '运载目标' },
    { name: '皇家赛道', type: '运载目标' },
    { name: '渣客镇', type: '运载目标' },
    { name: '香巴里寺院', type: '运载目标' },
    // 控制地图
    { name: '绿洲城', type: '占领要点' },
    { name: '南极半岛', type: '占领要点' },
    { name: '伊利奥斯', type: '占领要点' },
    { name: '漓江塔', type: '占领要点' },
    { name: '尼泊尔', type: '占领要点' },
    { name: '釜山', type: '占领要点' },
    { name: '萨摩亚', type: '占领要点' },
    // 闪点作战地图
    { name: '阿特利斯', type: '闪点作战' },
    { name: '新渣客城', type: '闪点作战' },
    { name: '苏拉瓦萨', type: '闪点作战' },
    // 机动推进地图
    { name: '新皇后街', type: '机动推进' },
    { name: '鲁纳塞彼', type: '机动推进' },
    { name: '斗兽场', type: '机动推进' },
    { name: '埃斯佩兰萨', type: '机动推进' }
  ];

  for (const mapData of maps) {
    await Map.findOrCreate({
      where: { name: mapData.name },
      defaults: mapData
    });
  }

  // 初始化英雄数据
  const heroes = [
    // 重装 - 斗士
    { name: '毛加', role: 'tank', subRole: '斗士' },
    { name: '奥丽莎', role: 'tank', subRole: '斗士' },
    { name: '路霸', role: 'tank', subRole: '斗士' },
    { name: '查莉娅', role: 'tank', subRole: '斗士' },
    // 重装 - 先锋
    { name: 'D.Va', role: 'tank', subRole: '先锋' },
    { name: '末日铁拳', role: 'tank', subRole: '先锋' },
    { name: '温斯顿', role: 'tank', subRole: '先锋' },
    { name: '破坏球', role: 'tank', subRole: '先锋' },
    // 重装 - 铁壁
    { name: '金驭', role: 'tank', subRole: '铁壁' },
    { name: '骇灾', role: 'tank', subRole: '铁壁' },
    { name: '渣客女王', role: 'tank', subRole: '铁壁' },
    { name: '拉玛刹', role: 'tank', subRole: '铁壁' },
    { name: '莱因哈特', role: 'tank', subRole: '铁壁' },
    { name: '西格玛', role: 'tank', subRole: '铁壁' },

    // 输出 - 神准
    { name: '艾什', role: 'damage', subRole: '神准' },
    { name: '卡西迪', role: 'damage', subRole: '神准' },
    { name: '半藏', role: 'damage', subRole: '神准' },
    { name: '索杰恩', role: 'damage', subRole: '神准' },
    { name: '黑百合', role: 'damage', subRole: '神准' },
    // 输出 - 奇袭
    { name: '安燃', role: 'damage', subRole: '奇袭' },
    { name: '死怨', role: 'damage', subRole: '奇袭' },
    { name: '源氏', role: 'damage', subRole: '奇袭' },
    { name: '死神', role: 'damage', subRole: '奇袭' },
    { name: '猎空', role: 'damage', subRole: '奇袭' },
    { name: '斩仇', role: 'damage', subRole: '奇袭' },
    { name: '探奇', role: 'damage', subRole: '奇袭' },
    // 输出 - 专业
    { name: '堡垒', role: 'damage', subRole: '专业' },
    { name: '埃姆雷', role: 'damage', subRole: '专业' },
    { name: '狂鼠', role: 'damage', subRole: '专业' },
    { name: '美', role: 'damage', subRole: '专业' },
    { name: '士兵：76', role: 'damage', subRole: '专业' },
    { name: '秩序之光', role: 'damage', subRole: '专业' },
    { name: '托比昂', role: 'damage', subRole: '专业' },
    // 输出 - 侦察
    { name: '回声', role: 'damage', subRole: '侦察' },
    { name: '弗雷娅', role: 'damage', subRole: '侦察' },
    { name: '法老之鹰', role: 'damage', subRole: '侦察' },
    { name: '西拉', role: 'damage', subRole: '侦察' },
    { name: '黑影', role: 'damage', subRole: '侦察' },

    // 支援 - 战术
    { name: '安娜', role: 'support', subRole: '战术' },
    { name: '巴蒂斯特', role: 'support', subRole: '战术' },
    { name: '飞天猫', role: 'support', subRole: '战术' },
    { name: '卢西奥', role: 'support', subRole: '战术' },
    { name: '禅雅塔', role: 'support', subRole: '战术' },
    // 支援 - 医疗
    { name: '雾子', role: 'support', subRole: '医疗' },
    { name: '生命之梭', role: 'support', subRole: '医疗' },
    { name: '天使', role: 'support', subRole: '医疗' },
    { name: '莫伊拉', role: 'support', subRole: '医疗' },
    // 支援 - 生存
    { name: '布里吉塔', role: 'support', subRole: '生存' },
    { name: '伊拉锐', role: 'support', subRole: '生存' },
    { name: '朱诺', role: 'support', subRole: '生存' },
    { name: '瑞稀', role: 'support', subRole: '生存' },
    { name: '无漾', role: 'support', subRole: '生存' }
  ];

  for (const heroData of heroes) {
    const [hero, created] = await Hero.findOrCreate({
      where: { name: heroData.name },
      defaults: heroData
    });
    
    if (!created && hero.subRole !== heroData.subRole) {
      hero.subRole = heroData.subRole;
      await hero.save();
    }
  }
};

module.exports = { initDatabase };
