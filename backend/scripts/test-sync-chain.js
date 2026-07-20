// 链路测试：外部同步 → 自动建赛季关联 → 数据写入
// 用注入的假 client 走真实同步管线，结束后清理全部测试数据并还原同步游标
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const { createIncrementalMatchSyncService, SYNC_CURSOR_CONFIG_KEY } = require('../services/IncrementalMatchSyncService');
const Config = require('../models/Config');
const Season = require('../models/Season');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Hero = require('../models/Hero');
const MapModel = require('../models/Map');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');

const EXT_ID = 'TEST-SYNC-CHAIN-001';
const TEAM_A = 'TEST_TEAM_ALPHA';
const TEAM_B = 'TEST_TEAM_BETA';

const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

(async () => {
  // ---- 0. 准备：取真实赛季/地图/英雄，备份会被动到的 Config ----
  const season = await Season.findOne({ order: [['id', 'DESC']] });
  const map = await MapModel.findOne();
  const heroes = await Hero.findAll({ limit: 3 });
  if (!season || !map || heroes.length < 2) throw new Error('缺少基础数据（赛季/地图/英雄）');
  const eventName = season.externalEventName || season.name;

  const cursorBackup = await Config.findByPk(SYNC_CURSOR_CONFIG_KEY);
  const summaryBackup = await Config.findByPk('latest_match_sync_updates');
  const backupValue = c => c ? { value: c.value, description: c.description } : null;
  const savedCursor = backupValue(cursorBackup);
  const savedSummary = backupValue(summaryBackup);

  const player = (name, role, hero) => ({
    name, role, kad: '10/5/3', damage: 5000, healing: 1200, blocked: 3000, finalBlows: 8,
    heroes: [{ hero: hero.name, usageSeconds: 630, usagePercentage: 100, finalBlows: 8, deathsByFinalBlow: 3, ultReady: 3, ultUsed: 3, avgUltChargeSeconds: 120.5 }]
  });
  const detail = {
    id: EXT_ID, eventName,
    teamA: { name: TEAM_A }, teamB: { name: TEAM_B },
    scoreA: 1, scoreB: 0, boFormat: 'BO3', matchDate: '2026-07-21',
    rounds: [{
      mapName: map.name, winner: 'A', roundScoreA: 1, roundScoreB: 0,
      duration: '10:30', statsVersion: 2, replayId: null,
      bans: { teamA: heroes[0].name, teamB: heroes[1].name },
      playersA: [player('TEST_PLAYER_A1', 'T', heroes[0]), player('TEST_PLAYER_A2', 'D', heroes[1])],
      playersB: [player('TEST_PLAYER_B1', 'T', heroes[0]), player('TEST_PLAYER_B2', 'S', heroes[2] || heroes[1])]
    }]
  };
  const fakeClient = {
    fetchChanges: async () => ({ items: [{ id: EXT_ID, operation: 'upsert' }], hasMore: false, nextCursor: 'test-cursor', schemaVersion: 2, generatedAt: new Date().toISOString() }),
    fetchMatch: async () => detail
  };

  try {
    // ---- 1. 第一次同步 ----
    const service = createIncrementalMatchSyncService({ client: fakeClient });
    const run1 = await service.run({ source: 'chain-test' });
    check('同步执行成功', run1.data.upsertedMatchesCount === 1, `new=${run1.data.newMatchesCount}, playerStats=${run1.data.playerStatsCount}, heroStats=${run1.data.heroStatsCount}`);

    // ---- 2. 验证数据写入 ----
    const match = await Match.findOne({ where: { externalId: EXT_ID } });
    check('Match 已写入且关联到正确赛季', match && match.seasonId === season.id, `season=${season.name}`);
    const mapGames = await MapGame.findAll({ where: { matchId: match.id } });
    check('MapGame 已写入', mapGames.length === 1);
    const stats = await PlayerStat.findAll({ where: { mapGameId: mapGames[0].id } });
    check('PlayerStat 已写入 4 行', stats.length === 4, `实际 ${stats.length}`);
    const heroStats = await PlayerHeroStat.findAll({ where: { playerStatId: { [Op.in]: stats.map(s => s.id) } } });
    check('PlayerHeroStat 已写入（含大招充能）', heroStats.length === 4 && heroStats.every(h => Number(h.avgUltChargeSeconds) === 120.5), `实际 ${heroStats.length}`);

    // ---- 3. 验证自动关联 ----
    const teamA = await Team.findOne({ where: { name: TEAM_A } });
    const teamB = await Team.findOne({ where: { name: TEAM_B } });
    check('新队伍已自动创建', teamA && teamB);
    const stA = await SeasonTeam.findOne({ where: { seasonId: season.id, teamId: teamA.id } });
    const stB = await SeasonTeam.findOne({ where: { seasonId: season.id, teamId: teamB.id } });
    check('SeasonTeam 关联已自动创建（赛季-队伍）', stA && stB);
    const stpCountA = await SeasonTeamPlayer.count({ where: { seasonTeamId: stA.id } });
    const stpCountB = await SeasonTeamPlayer.count({ where: { seasonTeamId: stB.id } });
    check('SeasonTeamPlayer 关联已自动创建（赛季-队伍-选手）', stpCountA === 2 && stpCountB === 2, `A队 ${stpCountA} 人，B队 ${stpCountB} 人`);

    // ---- 4. 幂等性：再同步一次，关联不应重复 ----
    await service.run({ source: 'chain-test' });
    const stpCountA2 = await SeasonTeamPlayer.count({ where: { seasonTeamId: stA.id } });
    const stACount = await SeasonTeam.count({ where: { seasonId: season.id, teamId: teamA.id } });
    check('重复同步不产生重复关联', stpCountA2 === 2 && stACount === 1, `A队选手关联 ${stpCountA2}，SeasonTeam ${stACount}`);

    // ---- 5. 清理测试数据 ----
    await PlayerHeroStat.destroy({ where: { playerStatId: { [Op.in]: stats.map(s => s.id) } } });
    await PlayerStat.destroy({ where: { mapGameId: mapGames[0].id } });
    await MapGame.destroy({ where: { matchId: match.id } });
    await match.destroy();
    await SeasonTeamPlayer.destroy({ where: { seasonTeamId: { [Op.in]: [stA.id, stB.id] } } });
    await SeasonTeam.destroy({ where: { id: { [Op.in]: [stA.id, stB.id] } } });
    await Player.destroy({ where: { name: { [Op.like]: 'TEST_PLAYER_%' } } });
    await Team.destroy({ where: { id: { [Op.in]: [teamA.id, teamB.id] } } });
    console.log('测试数据已清理');

    // ---- 6. 还原同步游标 ----
    const restore = async (key, saved, desc) => {
      if (saved) {
        const [c] = await Config.findOrCreate({ where: { key }, defaults: { value: saved.value, description: saved.description } });
        c.value = saved.value; c.description = saved.description; c.changed('value', true);
        await c.save();
      } else {
        await Config.destroy({ where: { key } });
      }
    };
    await restore(SYNC_CURSOR_CONFIG_KEY, savedCursor);
    await restore('latest_match_sync_updates', savedSummary);
    console.log('同步游标已还原');
  } finally {
    const failed = results.filter(r => !r.pass);
    console.log(`\n===== ${failed.length === 0 ? '全部通过' : `有 ${failed.length} 项失败`} (${results.length - failed.length}/${results.length}) =====`);
    await sequelize.close();
    process.exit(failed.length === 0 ? 0 : 1);
  }
})().catch(async e => { console.error('测试异常:', e); await sequelize.close(); process.exit(1); });
