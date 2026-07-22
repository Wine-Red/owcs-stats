// 测量每个赛季的新数据覆盖情况：ban / 英雄明细 / 最后一击 / 大招充能
const sequelize = require('../config/database');

(async () => {
  const [rows] = await sequelize.query(`
    SELECT
      s.id,
      s.name,
      COUNT(DISTINCT mg.id) AS mapGames,
      COUNT(DISTINCT CASE WHEN mg.team1BanHeroId IS NOT NULL OR mg.team2BanHeroId IS NOT NULL THEN mg.id END) AS withBans,
      COUNT(DISTINCT CASE WHEN mg.statsVersion >= 2 THEN mg.id END) AS v2Maps,
      SUM(CASE WHEN ps.finalBlows > 0 THEN 1 ELSE 0 END) AS fbRows,
      COUNT(DISTINCT phs.id) AS heroStatRows,
      SUM(CASE WHEN phs.avgUltChargeSeconds IS NOT NULL THEN 1 ELSE 0 END) AS ultRows
    FROM seasons s
    LEFT JOIN map_games mg ON mg.seasonId = s.id
    LEFT JOIN player_stats ps ON ps.mapGameId = mg.id
    LEFT JOIN player_hero_stats phs ON phs.playerStatId = ps.id
    GROUP BY s.id, s.name
    ORDER BY s.id
  `);
  for (const r of rows) {
    console.log(`[${r.id}] ${r.name}`);
    console.log(`    地图局=${r.mapGames} 有ban=${r.withBans} v2+=${r.v2Maps} 最后一击行=${r.fbRows} 英雄明细行=${r.heroStatRows} 大招充能行=${r.ultRows}`);
  }
  await sequelize.close();
})().catch(e => { console.error(e.message); process.exit(1); });
