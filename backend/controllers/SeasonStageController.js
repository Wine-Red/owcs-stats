const Match = require('../models/Match');
const Season = require('../models/Season');
const SeasonStage = require('../models/SeasonStage');
const sequelize = require('../config/database');
const SeasonStageService = require('../services/SeasonStageService');

const parseId = value => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const serializeRange = range => ({
  id: range.id,
  seasonId: range.seasonId,
  name: range.name,
  startMatchId: range.startMatchId,
  startMatch: range.startMatch,
  endMatchId: range.endMatch?.id || null,
  endMatch: range.endMatch,
  matchCount: range.matchCount,
  isCurrent: range.isCurrent,
  createdAt: range.createdAt,
  updatedAt: range.updatedAt
});

const validateStartMatch = async ({ seasonId, startMatchId, excludeStageId = null }) => {
  if (startMatchId === null) {
    const existing = await SeasonStage.findOne({ where: { seasonId, startMatchId: null } });
    return existing && Number(existing.id) !== Number(excludeStageId)
      ? '赛季起点已经被其他阶段使用'
      : null;
  }

  const match = await Match.findOne({ where: { id: startMatchId, seasonId } });
  if (!match) return '起始比赛不属于该赛季';
  const existing = await SeasonStage.findOne({ where: { seasonId, startMatchId } });
  return existing && Number(existing.id) !== Number(excludeStageId)
    ? '这场比赛已经是其他阶段的起点'
    : null;
};

const SeasonStageController = {
  list: async (req, res) => {
    try {
      const seasonId = parseId(req.params.seasonId);
      if (!seasonId) return res.status(400).json({ error: 'seasonId 不合法' });
      const ranges = await SeasonStageService.listSeasonStageRanges(seasonId);
      return res.json(ranges.map(serializeRange));
    } catch (error) {
      console.error('获取赛季阶段失败:', error);
      return res.status(500).json({ error: '获取赛季阶段失败' });
    }
  },

  create: async (req, res) => {
    try {
      const seasonId = parseId(req.params.seasonId);
      const name = String(req.body?.name || '').trim();
      if (!seasonId || !name) return res.status(400).json({ error: '赛季和阶段名称不能为空' });
      if (!await Season.findByPk(seasonId)) return res.status(404).json({ error: '赛季不存在' });

      const stageCount = await SeasonStage.count({ where: { seasonId } });
      const startMatchId = stageCount === 0 ? null : parseId(req.body?.startMatchId);
      if (stageCount > 0 && !startMatchId) {
        return res.status(400).json({ error: '请选择新阶段的第一场比赛' });
      }
      const validationError = await validateStartMatch({ seasonId, startMatchId });
      if (validationError) return res.status(400).json({ error: validationError });

      const stage = await SeasonStage.create({ seasonId, name, startMatchId });
      const range = await SeasonStageService.resolveStageRange(seasonId, stage.id);
      return res.status(201).json(serializeRange(range));
    } catch (error) {
      console.error('创建赛季阶段失败:', error);
      return res.status(500).json({ error: '创建赛季阶段失败' });
    }
  },

  update: async (req, res) => {
    try {
      const stageId = parseId(req.params.stageId);
      const stage = stageId ? await SeasonStage.findByPk(stageId) : null;
      if (!stage) return res.status(404).json({ error: '阶段不存在' });

      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: '阶段名称不能为空' });
      const requestedStart = req.body?.startMatchId === null ? null : parseId(req.body?.startMatchId);
      if (req.body?.startMatchId !== null && !requestedStart) {
        return res.status(400).json({ error: '请选择有效的起始比赛' });
      }
      const validationError = await validateStartMatch({
        seasonId: Number(stage.seasonId),
        startMatchId: requestedStart,
        excludeStageId: stage.id
      });
      if (validationError) return res.status(400).json({ error: validationError });

      stage.name = name;
      stage.startMatchId = requestedStart;
      await stage.save();
      const range = await SeasonStageService.resolveStageRange(stage.seasonId, stage.id);
      return res.json(serializeRange(range));
    } catch (error) {
      console.error('更新赛季阶段失败:', error);
      return res.status(500).json({ error: '更新赛季阶段失败' });
    }
  },

  delete: async (req, res) => {
    let transaction;
    try {
      const stageId = parseId(req.params.stageId);
      const stage = stageId ? await SeasonStage.findByPk(stageId) : null;
      if (!stage) return res.status(404).json({ error: '阶段不存在' });

      transaction = await sequelize.transaction();
      const ranges = await SeasonStageService.listSeasonStageRanges(stage.seasonId);
      const stageIndex = ranges.findIndex(item => Number(item.id) === Number(stage.id));
      const nextStageId = stageIndex >= 0 ? ranges[stageIndex + 1]?.id : null;
      await stage.destroy({ transaction });
      if (stage.startMatchId === null && nextStageId) {
        await SeasonStage.update(
          { startMatchId: null },
          { where: { id: nextStageId }, transaction }
        );
      }
      await transaction.commit();
      return res.json({ message: '阶段已删除' });
    } catch (error) {
      if (transaction) await transaction.rollback();
      console.error('删除赛季阶段失败:', error);
      return res.status(500).json({ error: '删除赛季阶段失败' });
    }
  }
};

module.exports = SeasonStageController;
