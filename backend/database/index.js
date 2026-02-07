const sequelize = require('../config/database');
const Season = require('../models/Season');
const Team = require('../models/Team'); // eslint-disable-line no-unused-vars
const SeasonTeam = require('../models/SeasonTeam'); // eslint-disable-line no-unused-vars
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer'); // eslint-disable-line no-unused-vars
const Player = require('../models/Player'); // eslint-disable-line no-unused-vars
const Map = require('../models/Map');
const Hero = require('../models/Hero');
const Match = require('../models/Match'); // eslint-disable-line no-unused-vars
const MapGame = require('../models/MapGame'); // eslint-disable-line no-unused-vars
const PlayerStat = require('../models/PlayerStat'); // eslint-disable-line no-unused-vars

const initDatabase = async () => {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 设置模型关联关系
    setupAssociations();

    // 自动同步模型到数据库
    await sequelize.sync({ alter: true });
    console.log('数据库模型同步成功');

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
  const SeasonTeam = require('../models/SeasonTeam');
  const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
  const Player = require('../models/Player');
  const Map = require('../models/Map');
  const Hero = require('../models/Hero');
  const Match = require('../models/Match');
  const MapGame = require('../models/MapGame');
  const PlayerStat = require('../models/PlayerStat');

  // PlayerStat 关联
  PlayerStat.belongsTo(MapGame, { foreignKey: 'mapGameId' });
  PlayerStat.belongsTo(Player, { foreignKey: 'playerId', as: 'player' });
  PlayerStat.belongsTo(Hero, { foreignKey: 'heroId', as: 'hero' });
  PlayerStat.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

  // MapGame 关联
  MapGame.hasMany(PlayerStat, { foreignKey: 'mapGameId', as: 'playerStats' });
};

const initBasicData = async () => {
  // 初始化赛季数据
  const seasons = [
    { name: '2026 季前训练营', status: 'in_progress' }
  ];

  for (const seasonData of seasons) {
    await Season.findOrCreate({
      where: { name: seasonData.name },
      defaults: seasonData
    });
  }

  // 初始化地图数据
  const maps = [
    // 混合地图
    { name: '艾兴瓦尔德', type: '混合' },
    { name: '暴雪世界', type: '混合' },
    { name: '好莱坞', type: '混合' },
    { name: '国王大道', type: '混合' },
    { name: '努巴尼', type: '混合' },
    { name: '帕拉伊苏', type: '混合' },
    { name: '中城', type: '混合' },
    // 护送地图
    { name: '监测站：直布罗陀', type: '护送' },
    { name: '多拉多', type: '护送' },
    { name: '哈瓦那', type: '护送' },
    { name: '里阿尔托', type: '护送' },
    { name: '66号公路', type: '护送' },
    { name: '皇家赛道', type: '护送' },
    { name: '渣客镇', type: '护送' },
    { name: '香巴里寺院', type: '护送' },
    // 控制地图
    { name: '绿洲城', type: '控制' },
    { name: '南极半岛', type: '控制' },
    { name: '伊利奥斯', type: '控制' },
    { name: '漓江塔', type: '控制' },
    { name: '尼泊尔', type: '控制' },
    { name: '釜山', type: '控制' },
    { name: '萨摩亚', type: '控制' },
    // 闪点地图
    { name: '阿特利斯', type: '闪点' },
    { name: '新渣客城', type: '闪点' },
    { name: '苏拉瓦萨', type: '闪点' },
    // 推进地图
    { name: '新皇后街', type: '推进' },
    { name: '鲁纳塞彼', type: '推进' },
    { name: '斗兽场', type: '推进' },
    { name: '埃斯佩兰萨', type: '推进' }
  ];

  for (const mapData of maps) {
    await Map.findOrCreate({
      where: { name: mapData.name },
      defaults: mapData
    });
  }

  // 初始化英雄数据
  const heroes = [
    // 重装（坦克）
    { name: '莱因哈特', role: 'tank' },
    { name: 'D.Va', role: 'tank' },
    { name: '温斯顿', role: 'tank' },
    { name: '查莉娅', role: 'tank' },
    { name: '奥丽莎', role: 'tank' },
    { name: '西格玛', role: 'tank' },
    { name: '拉玛刹', role: 'tank' },
    { name: '渣客女王', role: 'tank' },
    { name: '骇灾', role: 'tank' },
    { name: '路霸', role: 'tank' },
    { name: '毛加', role: 'tank' },
    { name: '末日铁拳', role: 'tank' },
    { name: '破坏球', role: 'tank' },
    // 输出
    { name: '源氏', role: 'damage' },
    { name: '半藏', role: 'damage' },
    { name: '猎空', role: 'damage' },
    { name: '法老之鹰', role: 'damage' },
    { name: '卡西迪', role: 'damage' },
    { name: '艾什', role: 'damage' },
    { name: '黑百合', role: 'damage' },
    { name: '索杰恩', role: 'damage' },
    { name: '堡垒', role: 'damage' },
    { name: '弗雷娅', role: 'damage' },
    { name: '黑影', role: 'damage' },
    { name: '回声', role: 'damage' },
    { name: '狂鼠', role: 'damage' },
    { name: '美', role: 'damage' },
    { name: '士兵：76', role: 'damage' },
    { name: '死神', role: 'damage' },
    { name: '探奇', role: 'damage' },
    { name: '秩序之光', role: 'damage' },
    { name: '托比昂', role: 'damage' },
    { name: '斩仇', role: 'damage' },
    // 辅助
    { name: '卢西奥', role: 'support' },
    { name: '安娜', role: 'support' },
    { name: '天使', role: 'support' },
    { name: '禅雅塔', role: 'support' },
    { name: '莫伊拉', role: 'support' },
    { name: '布丽吉塔', role: 'support' },
    { name: '巴蒂斯特', role: 'support' },
    { name: '雾子', role: 'support' },
    { name: '生命之梭', role: 'support' },
    { name: '无漾', role: 'support' },
    { name: '伊拉锐', role: 'support' },
    { name: '朱诺', role: 'support' }
  ];

  for (const heroData of heroes) {
    await Hero.findOrCreate({
      where: { name: heroData.name },
      defaults: heroData
    });
  }
};

module.exports = { initDatabase };