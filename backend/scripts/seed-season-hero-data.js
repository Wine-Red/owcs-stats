/**
 * 为指定赛季生成演示用的完整英雄级数据（开发/演示库专用）：
 * - 为缺失 ban 的地图局补齐双方 ban（互不相同）
 * - 为缺少英雄明细的 player_stats 生成 player_hero_stats
 *   （每名选手有稳定的英雄池：主英雄 + 30% 概率副英雄；每场 75% 全程主英雄）
 *   包含 usageSeconds / finalBlows / deathsByFinalBlow / ultReady / ultUsed / avgUltChargeSeconds
 * - 同步 player_stats.finalBlows 为英雄行合计
 *
 * 用法：node scripts/seed-season-hero-data.js [seasonId]   （默认 13）
 * 可重复运行：已有英雄明细的 player_stats 会跳过；已有 ban 的地图局不改动。
 */
const sequelize = require('../config/database');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const Player = require('../models/Player');
const Hero = require('../models/Hero');

// 确定性伪随机（可复现）
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const FINAL_BLOW_RATE_PER_10MIN = { tank: [6, 10], damage: [10, 16], support: [2, 6] };

const main = async () => {
  const seasonId = Number(process.argv[2] || 13);

  const [games, heroes, players] = await Promise.all([
    MapGame.findAll({ where: { seasonId }, raw: true }),
    Hero.findAll({ raw: true }),
    Player.findAll({ raw: true })
  ]);
  if (!games.length) {
    console.log(`赛季 ${seasonId} 没有地图局，退出`);
    return;
  }

  const heroesByRole = { tank: [], damage: [], support: [] };
  heroes.forEach(h => {
    const role = ['tank', 'damage', 'support'].includes(h.role) ? h.role : 'damage';
    heroesByRole[role].push(h);
  });
  const playerById = new Map(players.map(p => [Number(p.id), p]));

  // 每名选手的稳定英雄池（按 playerId 播种，跨场一致）
  const heroPoolByPlayerId = new Map();
  const getHeroPool = (playerId) => {
    if (heroPoolByPlayerId.has(playerId)) return heroPoolByPlayerId.get(playerId);
    const player = playerById.get(playerId);
    const role = player && ['tank', 'damage', 'support'].includes(player.role) ? player.role : 'damage';
    const candidates = heroesByRole[role];
    const rand = mulberry32(playerId * 7919 + 17);
    const main = candidates[Math.floor(rand() * candidates.length)];
    let off = null;
    if (rand() < 0.3 && candidates.length > 1) {
      do { off = candidates[Math.floor(rand() * candidates.length)]; } while (off.id === main.id);
    }
    const pool = { main, off };
    heroPoolByPlayerId.set(playerId, pool);
    return pool;
  };

  const gameIds = games.map(g => g.id);
  const playerStats = await PlayerStat.findAll({ where: { mapGameId: gameIds }, raw: true });
  const existingHeroRows = await PlayerHeroStat.findAll({
    where: { playerStatId: playerStats.map(s => s.id) },
    attributes: ['playerStatId'],
    raw: true
  });
  const hasHeroRows = new Set(existingHeroRows.map(r => Number(r.playerStatId)));
  const gameById = new Map(games.map(g => [Number(g.id), g]));

  // 1) 补齐 ban
  let banUpdated = 0;
  for (const game of games) {
    if (game.team1BanHeroId && game.team2BanHeroId) continue;
    const rand = mulberry32(Number(game.id) * 31 + 7);
    const pick = () => heroes[Math.floor(rand() * heroes.length)].id;
    const t1 = game.team1BanHeroId || pick();
    let t2 = game.team2BanHeroId || pick();
    if (t2 === t1) t2 = pick() === t1 ? heroes[(heroes.findIndex(h => h.id === t1) + 1) % heroes.length].id : t2;
    await MapGame.update(
      { team1BanHeroId: t1, team2BanHeroId: t2 },
      { where: { id: game.id } }
    );
    banUpdated++;
  }

  // 2) 生成英雄明细
  let rowsCreated = 0;
  let statsTouched = 0;
  for (const ps of playerStats) {
    if (hasHeroRows.has(Number(ps.id))) continue;
    const game = gameById.get(Number(ps.mapGameId));
    if (!game) continue;
    const player = playerById.get(Number(ps.playerId));
    const role = player && ['tank', 'damage', 'support'].includes(player.role) ? player.role : 'damage';
    const pool = getHeroPool(Number(ps.playerId));
    const rand = mulberry32(Number(ps.id) * 13 + 3);

    const durSec = Math.max(60, Math.round((Number(game.duration) || 10) * 60));
    const useOff = pool.off && rand() < 0.25;
    const mainShare = useOff ? 0.65 + rand() * 0.2 : 1;
    const mainSec = Math.round(durSec * mainShare);
    const offSec = durSec - mainSec;

    const [rateLo, rateHi] = FINAL_BLOW_RATE_PER_10MIN[role];
    const rate = rateLo + rand() * (rateHi - rateLo);
    const totalFb = Math.max(0, Math.round(rate * (durSec / 600) * (0.8 + rand() * 0.4)));
    const fbMain = useOff ? Math.round(totalFb * mainShare) : totalFb;
    const fbOff = totalFb - fbMain;

    const mkRow = (hero, seconds, fb) => {
      const charge = Math.round(90 + rand() * 70);
      const ultUsed = Math.max(1, Math.round((seconds / charge) * 0.9));
      return {
        playerStatId: ps.id,
        heroId: hero.id,
        heroName: hero.name,
        usageSeconds: seconds,
        usagePercentage: Math.round((seconds / durSec) * 1000) / 10,
        finalBlows: fb,
        deathsByFinalBlow: Math.round(fb * (0.8 + rand() * 0.5)),
        ultReady: ultUsed + (rand() < 0.5 ? 1 : 0),
        ultUsed,
        avgUltChargeSeconds: charge
      };
    };

    const rows = [mkRow(pool.main, mainSec, fbMain)];
    if (useOff && offSec > 0) rows.push(mkRow(pool.off, offSec, fbOff));
    await PlayerHeroStat.bulkCreate(rows);
    rowsCreated += rows.length;

    await PlayerStat.update({ finalBlows: totalFb }, { where: { id: ps.id } });
    statsTouched++;
  }

  console.log(`赛季 ${seasonId}：地图局 ${games.length}，补 ban ${banUpdated} 局，生成英雄明细 ${rowsCreated} 行（覆盖选手数据 ${statsTouched} 条）`);
};

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
