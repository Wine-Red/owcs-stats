const sequelize = require('../config/database');
const SeasonStatsCalculator = require('../services/SeasonStatsCalculator');
const SeasonStageService = require('../services/SeasonStageService');

const parseOptionalInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
};

const resolveStageCalculationOptions = async (seasonId, stageIdValue) => {
  const stageId = parseOptionalInt(stageIdValue);
  if (!stageId) return {};
  const stageRange = await SeasonStageService.resolveStageRange(Number(seasonId), stageId);
  return stageRange ? { matchIds: stageRange.matchIds } : null;
};

const SeasonStatController = {
  // Get aggregated season stats（从原始比赛表实时计算，不再读取预聚合表）
  getSeasonStats: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const options = await resolveStageCalculationOptions(seasonId, req.query.stageId);
      if (!options) return res.status(404).json({ error: '阶段不存在或不属于该赛季' });
      const stats = await SeasonStatsCalculator.calculateSeasonPlayerStats(seasonId, options);
      res.json(stats);
    } catch (error) {
      console.error('获取赛季数据失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  },

  getSeasonTeamScoreStats: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const options = await resolveStageCalculationOptions(seasonId, req.query.stageId);
      if (!options) return res.status(404).json({ error: '阶段不存在或不属于该赛季' });
      const stats = await SeasonStatsCalculator.calculateSeasonTeamScoreStats(seasonId, options);
      return res.json(stats);
    } catch (error) {
      console.error('获取赛季战队比分统计失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  },

  getSeasonMapPickStats: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const options = await resolveStageCalculationOptions(seasonId, req.query.stageId);
      if (!options) return res.status(404).json({ error: '阶段不存在或不属于该赛季' });
      const stats = await SeasonStatsCalculator.calculateSeasonMapPickStats(seasonId, options);
      res.json(stats);
    } catch (error) {
      console.error('获取赛季地图选取统计失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  },

  // 赛季数据维度探测：判断该赛季是否写入了 ban / 英雄明细 / 最后一击 / 大招充能等新指标，
  // 供前端按“数据存在性”动态展示对应板块（旧赛季无数据时不展示空板块）。
  getSeasonFeatures: async (req, res) => {
    try {
      const seasonIdNum = Number(req.params.seasonId);
      if (!Number.isFinite(seasonIdNum)) {
        return res.status(400).json({ error: 'seasonId 不合法' });
      }
      const [rows] = await sequelize.query(`
        SELECT
          COUNT(DISTINCT mg.id) AS totalMapGames,
          COUNT(DISTINCT CASE WHEN mg.team1BanHeroId IS NOT NULL OR mg.team2BanHeroId IS NOT NULL THEN mg.id END) AS mapsWithBans,
          COUNT(DISTINCT phs.id) AS heroStatRows,
          SUM(CASE WHEN ps.finalBlows > 0 THEN 1 ELSE 0 END) AS finalBlowRows,
          SUM(CASE WHEN phs.avgUltChargeSeconds IS NOT NULL OR phs.ultReady > 0 OR phs.ultUsed > 0 THEN 1 ELSE 0 END) AS ultRows
        FROM map_games mg
        LEFT JOIN player_stats ps ON ps.mapGameId = mg.id
        LEFT JOIN player_hero_stats phs ON phs.playerStatId = ps.id
        WHERE mg.seasonId = :seasonId
      `, { replacements: { seasonId: seasonIdNum } });
      const r = rows[0] || {};
      const num = v => Number(v) || 0;
      return res.json({
        seasonId: seasonIdNum,
        totalMapGames: num(r.totalMapGames),
        hasBans: num(r.mapsWithBans) > 0,
        hasHeroStats: num(r.heroStatRows) > 0,
        hasFinalBlows: num(r.finalBlowRows) > 0,
        hasUltCharge: num(r.ultRows) > 0
      });
    } catch (error) {
      console.error('获取赛季数据维度探测失败:', error);
      return res.status(500).json({ error: '获取数据失败' });
    }
  },

  // 队伍常用阵容：该队伍在本赛季的五人稳定英雄阵容（按累计在场时长排序，至多三套）
  getSeasonTeamCompositions: async (req, res) => {
    try {
      const { seasonId, teamId } = req.params;
      const options = await resolveStageCalculationOptions(seasonId, req.query.stageId);
      if (!options) return res.status(404).json({ error: '阶段不存在或不属于该赛季' });
      const compositions = await SeasonStatsCalculator.calculateSeasonTeamCompositions(seasonId, teamId, options);
      return res.json(compositions);
    } catch (error) {
      console.error('获取队伍常用阵容失败:', error);
      return res.status(500).json({ error: '获取数据失败' });
    }
  },

  // 队伍英雄数据：英雄使用情况 + ban 倾向（我方 ban / 对手 ban）
  getSeasonTeamHeroStats: async (req, res) => {
    try {
      const { seasonId, teamId } = req.params;
      const options = await resolveStageCalculationOptions(seasonId, req.query.stageId);
      if (!options) return res.status(404).json({ error: '阶段不存在或不属于该赛季' });
      const stats = await SeasonStatsCalculator.calculateSeasonTeamHeroStats(seasonId, teamId, options);
      return res.json(stats);
    } catch (error) {
      console.error('获取队伍英雄数据失败:', error);
      return res.status(500).json({ error: '获取数据失败' });
    }
  }
};

module.exports = SeasonStatController;
