const { Op } = require('sequelize');
const sequelize = require('../config/database');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const RosterReadService = require('../services/RosterReadService');
const SeasonTeam = require('../models/SeasonTeam');
const Player = require('../models/Player');
const {
  addManualSeasonTeamPlayer,
  removeManualSeasonTeamPlayer
} = require('../services/MembershipSourceService');

const loadRelation = (id, transaction) => RosterReadService.getSeasonTeamPlayers({ id, transaction });

class SeasonTeamPlayerController {
  static async getAll(req, res) {
    try {
      res.json(await RosterReadService.getSeasonTeamPlayers());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getById(req, res) {
    try {
      const row = await loadRelation(req.params.id);
      if (!row) return res.status(404).json({ error: '赛季-队伍-选手关联不存在' });
      res.json(row);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getPlayersBySeasonTeamId(req, res) {
    try {
      res.json(await RosterReadService.getSeasonTeamPlayers({ seasonTeamId: req.params.seasonTeamId }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async create(req, res) {
    try {
      const { seasonTeamId, playerId } = req.body;
      const result = await sequelize.transaction(async transaction => {
        const [seasonTeam, player] = await Promise.all([
          SeasonTeam.findByPk(seasonTeamId, { transaction }),
          Player.findByPk(playerId, { transaction })
        ]);
        if (!seasonTeam) throw Object.assign(new Error('赛季-队伍关联不存在'), { statusCode: 400 });
        if (!player) throw Object.assign(new Error('选手不存在'), { statusCode: 400 });
        const ensured = await addManualSeasonTeamPlayer({ seasonTeam, playerId, transaction });
        return {
          relation: await loadRelation(ensured.seasonTeamPlayer.id, transaction),
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
      const { seasonTeamId, playerIds } = req.body;
      if (!seasonTeamId || !Array.isArray(playerIds) || playerIds.length === 0) {
        return res.status(400).json({ error: '参数错误' });
      }
      const result = await sequelize.transaction(async transaction => {
        const seasonTeam = await SeasonTeam.findByPk(seasonTeamId, { transaction });
        if (!seasonTeam) throw Object.assign(new Error('赛季-队伍关联不存在'), { statusCode: 400 });
        const uniqueIds = [...new Set(playerIds.map(Number))];
        const players = await Player.findAll({ where: { id: { [Op.in]: uniqueIds } }, transaction });
        if (players.length !== uniqueIds.length) {
          throw Object.assign(new Error('部分选手不存在'), { statusCode: 400 });
        }
        const created = [];
        const existing = [];
        for (const playerId of uniqueIds) {
          const ensured = await addManualSeasonTeamPlayer({ seasonTeam, playerId, transaction });
          const relation = await loadRelation(ensured.seasonTeamPlayer.id, transaction);
          if (ensured.relationCreated) created.push(relation);
          else existing.push(playerId);
        }
        return { created, existing };
      });
      res.status(201).json({
        ...result,
        message: `成功添加 ${result.created.length} 个选手关联，${result.existing.length} 个已有关系已保留为手工配置`
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
        const relation = await SeasonTeamPlayer.findByPk(req.params.id, { transaction });
        if (!relation) return null;
        return removeManualSeasonTeamPlayer(relation.id, transaction);
      });
      if (!result) return res.status(404).json({ error: '赛季-队伍-选手关联不存在' });
      res.json({
        message: result.retained
          ? '手工来源已移除；该选手仍有比赛或阵容证据，因此继续保留'
          : '赛季-队伍-选手关联删除成功',
        ...result
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SeasonTeamPlayerController;
