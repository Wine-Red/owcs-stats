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
const SeasonPlayerStat = require('../models/SeasonPlayerStat'); // eslint-disable-line no-unused-vars
const Config = require('../models/Config'); // eslint-disable-line no-unused-vars

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
  const SeasonPlayerStat = require('../models/SeasonPlayerStat');

  // PlayerStat 关联
  PlayerStat.belongsTo(MapGame, { foreignKey: 'mapGameId' });
  PlayerStat.belongsTo(Player, { foreignKey: 'playerId', as: 'player' });
  PlayerStat.belongsTo(Hero, { foreignKey: 'heroId', as: 'hero' });
  PlayerStat.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

  // MapGame 关联
  MapGame.hasMany(PlayerStat, { foreignKey: 'mapGameId', as: 'playerStats' });

  // SeasonPlayerStat 关联
  SeasonPlayerStat.belongsTo(Season, { foreignKey: 'seasonId', as: 'season' });
  SeasonPlayerStat.belongsTo(Player, { foreignKey: 'playerId', as: 'player' });
  SeasonPlayerStat.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

  Season.hasMany(SeasonPlayerStat, { foreignKey: 'seasonId', as: 'seasonPlayerStats' });
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
    // 攻击/护送地图
    { name: '艾兴瓦尔德', type: '攻击/护送' },
    { name: '暴雪世界', type: '攻击/护送' },
    { name: '好莱坞', type: '攻击/护送' },
    { name: '国王大道', type: '攻击/护送' },
    { name: '努巴尼', type: '攻击/护送' },
    { name: '帕拉伊苏', type: '攻击/护送' },
    { name: '中城', type: '攻击/护送' },
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