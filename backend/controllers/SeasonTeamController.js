const { Op } = require('sequelize');
const sequelize = require('../config/database');
const SeasonTeam = require('../models/SeasonTeam');
const RosterReadService = require('../services/RosterReadService');
const Season = require('../models/Season');
const Team = require('../models/Team');
const { addManualSeasonTeam, removeManualSeasonTeam } = require('../services/MembershipSourceService');

const loadSeasonTeam = (id, transaction) => RosterReadService.getSeasonTeams({ id, transaction });

class SeasonTeamController {
  static async getAll(req, res) {
    try {
      res.json(await RosterReadService.getSeasonTeams());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getById(req, res) {
    try {
      const seasonTeam = await loadSeasonTeam(req.params.id);
      if (!seasonTeam) return res.status(404).json({ error: '赛季-队伍关联不存在' });
      res.json(seasonTeam);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getTeamsBySeasonId(req, res) {
    try {
      const season = await Season.findByPk(req.params.seasonId, {
        include: [{
          model: Team,
          through: { attributes: [] },
          attributes: ['id', 'name', 'region', 'logo']
        }]
      });
      if (!season) return res.status(404).json({ error: '赛季不存在' });
      res.json(season.Teams);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async create(req, res) {
    try {
      const { seasonId, teamId } = req.body;
      const result = await sequelize.transaction(async transaction => {
        const [season, team] = await Promise.all([
          Season.findByPk(seasonId, { transaction }),
          Team.findByPk(teamId, { transaction })
        ]);
        if (!season) throw Object.assign(new Error('赛季不存在'), { statusCode: 400 });
        if (!team) throw Object.assign(new Error('队伍不存在'), { statusCode: 400 });
        const ensured = await addManualSeasonTeam({ seasonId, teamId, transaction });
        return {
          relation: await loadSeasonTeam(ensured.seasonTeam.id, transaction),
          created: ensured.relationCreated
        };
      });
      res.status(result.created ? 201 : 200).json(result.relation);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  static async bulkCreate(req, res) {
    try {
      const { seasonId, teamIds } = req.body;
      if (!seasonId || !Array.isArray(teamIds) || teamIds.length === 0) {
        return res.status(400).json({ error: '参数错误' });
      }
      const result = await sequelize.transaction(async transaction => {
        const season = await Season.findByPk(seasonId, { transaction });
        if (!season) throw Object.assign(new Error('赛季不存在'), { statusCode: 400 });
        const uniqueIds = [...new Set(teamIds.map(Number))];
        const teams = await Team.findAll({ where: { id: { [Op.in]: uniqueIds } }, transaction });
        if (teams.length !== uniqueIds.length) {
          throw Object.assign(new Error('部分队伍不存在'), { statusCode: 400 });
        }
        const created = [];
        const existing = [];
        for (const teamId of uniqueIds) {
          const ensured = await addManualSeasonTeam({ seasonId, teamId, transaction });
          const relation = await loadSeasonTeam(ensured.seasonTeam.id, transaction);
          if (ensured.relationCreated) created.push(relation);
          else existing.push(teamId);
        }
        return { created, existing };
      });
      res.status(201).json({
        ...result,
        message: `成功添加 ${result.created.length} 个队伍关联，${result.existing.length} 个已有关系已保留为手工配置`
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  static async update(req, res) {
    return res.status(405).json({
      code: 'MEMBERSHIP_RELATION_IMMUTABLE',
      message: '成员关系不能直接改写，请删除手工配置后重新添加'
    });
  }

  static async delete(req, res) {
    try {
      const result = await sequelize.transaction(async transaction => {
        const relation = await SeasonTeam.findByPk(req.params.id, { transaction });
        if (!relation) return null;
        return removeManualSeasonTeam(relation.id, transaction);
      });
      if (!result) return res.status(404).json({ error: '赛季-队伍关联不存在' });
      res.json({
        message: result.retained
          ? '手工来源已移除；该关系仍有比赛、阵容或成员证据，因此继续保留'
          : '赛季-队伍关联删除成功',
        ...result
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SeasonTeamController;
