// 一次性检查：存量比赛数据 vs 现有关联表，看缺不缺
const sequelize = require('../config/database');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');

(async () => {
  // 1. 比赛数据里实际出现过的 赛季-队伍 组合
  const mgPairs = await MapGame.findAll({
    attributes: [
      'seasonId',
      [sequelize.fn('GROUP_CONCAT', sequelize.fn('DISTINCT', sequelize.col('team1Id'))), 't1'],
      [sequelize.fn('GROUP_CONCAT', sequelize.fn('DISTINCT', sequelize.col('team2Id'))), 't2']
    ],
    group: ['seasonId'],
    raw: true
  });
  const neededST = new Set();
  for (const row of mgPairs) {
    for (const t of [...String(row.t1 || '').split(','), ...String(row.t2 || '').split(',')]) {
      if (t) neededST.add(`${row.seasonId}:${t}`);
    }
  }

  // 2. 已有的 SeasonTeam
  const existingST = await SeasonTeam.findAll({ raw: true });
  const existingSTKeys = new Set(existingST.map(r => `${r.seasonId}:${r.teamId}`));
  const stByKey = new Map(existingST.map(r => [`${r.seasonId}:${r.teamId}`, r.id]));

  const missingST = [...neededST].filter(k => !existingSTKeys.has(k));

  // 3. 比赛数据里实际出现过的 赛季-队伍-选手 组合（JS 里手动拼接，避免模型关联依赖）
  const mapSeason = new Map((await MapGame.findAll({ attributes: ['id', 'seasonId'], raw: true })).map(g => [g.id, g.seasonId]));
  const psRows = await PlayerStat.findAll({ attributes: ['mapGameId', 'teamId', 'playerId'], raw: true });
  const neededSTP = new Set();
  for (const r of psRows) {
    const seasonId = mapSeason.get(r.mapGameId);
    const stId = stByKey.get(`${seasonId}:${r.teamId}`);
    if (stId) neededSTP.add(`${stId}:${r.playerId}`);
  }

  const existingSTP = await SeasonTeamPlayer.findAll({ raw: true });
  const existingSTPKeys = new Set(existingSTP.map(r => `${r.seasonTeamId}:${r.playerId}`));
  const missingSTP = [...neededSTP].filter(k => !existingSTPKeys.has(k));

  console.log(`赛季-队伍：比赛数据涉及 ${neededST.size} 个组合，已有关联 ${existingST.length} 条，缺失 ${missingST.length} 个`);
  if (missingST.length) console.log('  缺失样例:', missingST.slice(0, 10));
  console.log(`赛季-队伍-选手：比赛数据涉及 ${neededSTP.size} 个组合，已有关联 ${existingSTP.length} 条，缺失 ${missingSTP.length} 个`);
  if (missingSTP.length) console.log('  缺失样例:', missingSTP.slice(0, 10));

  await sequelize.close();
})().catch(e => { console.error(e.message); process.exit(1); });
