const Player = require('../models/Player');
const Team = require('../models/Team');
const Season = require('../models/Season');
const SeasonStageSnapshot = require('../models/SeasonStageSnapshot');
const SeasonStageSnapshotTeamScoreStat = require('../models/SeasonStageSnapshotTeamScoreStat');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const SeasonStatsCalculator = require('../services/SeasonStatsCalculator');

const parseOptionalInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
};

const calcNonNegativeDiff = (toVal, fromVal) => {
  const a = Number(toVal ?? 0) || 0;
  const b = Number(fromVal ?? 0) || 0;
  const diff = a - b;
  return diff < 0 ? 0 : diff;
};

const SeasonStatController = {
  listStageSnapshots: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const seasonIdNum = Number(seasonId);
      if (!Number.isFinite(seasonIdNum)) {
        return res.status(400).json({ error: 'seasonId 不合法' });
      }

      const snapshots = await SeasonStageSnapshot.findAll({
        where: { seasonId: seasonIdNum },
        order: [['createdAt', 'ASC']]
      });
      return res.json(snapshots);
    } catch (error) {
      console.error('获取阶段快照列表失败:', error);
      return res.status(500).json({ error: '获取数据失败' });
    }
  },

  createStageSnapshot: async (req, res) => {
    let t;
    try {
      const { seasonId } = req.params;
      const seasonIdNum = Number(seasonId);
      if (!Number.isFinite(seasonIdNum)) {
        return res.status(400).json({ error: 'seasonId 不合法' });
      }

      const name = String(req.body?.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'name 不能为空' });
      }

      const season = await Season.findByPk(seasonIdNum);
      if (!season) {
        return res.status(404).json({ error: '赛季不存在' });
      }

      // 快照定格当前真实值：从原始比赛表实时计算，不再读预聚合表
      const currentStats = await SeasonStatsCalculator.calculateSeasonTeamScoreStats(seasonIdNum);

      t = await sequelize.transaction();

      const snapshot = await SeasonStageSnapshot.create({
        seasonId: seasonIdNum,
        name
      }, { transaction: t });

      if (currentStats.length > 0) {
        const rows = currentStats.map(s => ({
          snapshotId: snapshot.id,
          teamId: s.teamId,
          teamName: s.teamName,
          teamShortName: s.teamShortName ?? null,
          matchWin: s.matchWin ?? 0,
          matchLoss: s.matchLoss ?? 0,
          matchDiff: s.matchDiff ?? 0,
          mapWin: s.mapWin ?? 0,
          mapLoss: s.mapLoss ?? 0,
          mapDiff: s.mapDiff ?? 0
        }));
        await SeasonStageSnapshotTeamScoreStat.bulkCreate(rows, { transaction: t });
      }

      await t.commit();
      return res.json(snapshot);
    } catch (error) {
      if (t) await t.rollback();
      console.error('创建阶段快照失败:', error);
      return res.status(500).json({ error: '创建快照失败' });
    }
  },

  deleteStageSnapshot: async (req, res) => {
    let t;
    try {
      const snapshotId = Number(req.params.snapshotId);
      if (!Number.isFinite(snapshotId)) {
        return res.status(400).json({ error: 'snapshotId 不合法' });
      }

      const snapshot = await SeasonStageSnapshot.findByPk(snapshotId);
      if (!snapshot) {
        return res.status(404).json({ error: '快照不存在' });
      }

      t = await sequelize.transaction();
      await SeasonStageSnapshotTeamScoreStat.destroy({
        where: { snapshotId },
        transaction: t
      });
      await SeasonStageSnapshot.destroy({
        where: { id: snapshotId },
        transaction: t
      });
      await t.commit();
      return res.json({ message: '删除成功' });
    } catch (error) {
      if (t) await t.rollback();
      console.error('删除阶段快照失败:', error);
      return res.status(500).json({ error: '删除失败' });
    }
  },

  // Get aggregated season stats（从原始比赛表实时计算，不再读取预聚合表）
  getSeasonStats: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const stats = await SeasonStatsCalculator.calculateSeasonPlayerStats(seasonId);
      res.json(stats);
    } catch (error) {
      console.error('获取赛季数据失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  },

  getSeasonTeamScoreStats: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const fromSnapshotId = parseOptionalInt(req.query.fromSnapshotId);
      const toSnapshotId = parseOptionalInt(req.query.toSnapshotId);

      if (!fromSnapshotId && !toSnapshotId) {
        // 无快照参数：从原始比赛表实时计算战队大场/小局战绩
        const stats = await SeasonStatsCalculator.calculateSeasonTeamScoreStats(seasonId);
        return res.json(stats);
      }

      const seasonIdNum = Number(seasonId);
      if (!Number.isFinite(seasonIdNum)) {
        return res.status(400).json({ error: 'seasonId 不合法' });
      }

      let toStats = [];
      if (toSnapshotId) {
        const snapshot = await SeasonStageSnapshot.findByPk(toSnapshotId);
        if (!snapshot || Number(snapshot.seasonId) !== seasonIdNum) {
          return res.status(400).json({ error: 'toSnapshotId 不属于该赛季' });
        }
        toStats = await SeasonStageSnapshotTeamScoreStat.findAll({
          where: { snapshotId: toSnapshotId }
        });
      } else {
        // to 侧为当前值：从原始比赛表实时计算，不再读预聚合表
        toStats = await SeasonStatsCalculator.calculateSeasonTeamScoreStats(seasonIdNum);
      }

      const fromMap = new Map();
      const fromNameMap = new Map();
      if (fromSnapshotId) {
        const snapshot = await SeasonStageSnapshot.findByPk(fromSnapshotId);
        if (!snapshot || Number(snapshot.seasonId) !== seasonIdNum) {
          return res.status(400).json({ error: 'fromSnapshotId 不属于该赛季' });
        }
        const fromStats = await SeasonStageSnapshotTeamScoreStat.findAll({
          where: { snapshotId: fromSnapshotId }
        });
        fromStats.forEach(s => {
          fromMap.set(Number(s.teamId), s);
          const key = String(s.teamName || '').trim().toLowerCase();
          if (key) fromNameMap.set(key, s);
        });
      }

      const teamIds = [];
      const diffStats = toStats.map(s => {
        const teamId = Number(s.teamId);
        if (Number.isFinite(teamId)) teamIds.push(teamId);
        const prev = fromMap.get(teamId) || fromNameMap.get(String(s.teamName || '').trim().toLowerCase());
        const matchWin = calcNonNegativeDiff(s.matchWin, prev?.matchWin);
        const matchLoss = calcNonNegativeDiff(s.matchLoss, prev?.matchLoss);
        const mapWin = calcNonNegativeDiff(s.mapWin, prev?.mapWin);
        const mapLoss = calcNonNegativeDiff(s.mapLoss, prev?.mapLoss);
        return {
          teamId,
          teamName: s.teamName,
          teamShortName: s.teamShortName ?? null,
          matchWin,
          matchLoss,
          matchDiff: matchWin - matchLoss,
          mapWin,
          mapLoss,
          mapDiff: mapWin - mapLoss
        };
      });

      const teams = await Team.findAll({
        where: { id: { [Op.in]: teamIds } }
      });
      const teamMap = new Map(teams.map(t => [Number(t.id), t]));

      diffStats.forEach(s => {
        s.team = teamMap.get(Number(s.teamId)) || null;
      });

      return res.json(diffStats);
    } catch (error) {
      console.error('获取赛季战队比分统计失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  },

  getSeasonMapPickStats: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const stats = await SeasonStatsCalculator.calculateSeasonMapPickStats(seasonId);
      res.json(stats);
    } catch (error) {
      console.error('获取赛季地图选取统计失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  }
};

module.exports = SeasonStatController;
