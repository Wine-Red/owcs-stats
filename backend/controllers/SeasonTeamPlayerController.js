const { Op } = require('sequelize');
const sequelize = require('../config/database');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource');
const SeasonTeam = require('../models/SeasonTeam');
const Player = require('../models/Player');
const {
  addManualSeasonTeamPlayer,
  removeManualSeasonTeamPlayer
} = require('../services/MembershipSourceService');

const attachSourceTypes = async (rows, transaction) => {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  if (!list.length) return Array.isArray(rows) ? [] : null;
  const relationIds = list.map(row => Number(row.id));
  const sourceRows = await SeasonTeamPlayerSource.findAll({
    where: { seasonTeamPlayerId: { [Op.in]: relationIds }, active: true },
    attributes: ['seasonTeamPlayerId', 'sourceType'],
    group: ['seasonTeamPlayerId', 'sourceType'],
    transaction,
    raw: true
  });
  const sourceTypesById = new Map();
  for (const source of sourceRows) {
    const id = Number(source.seasonTeamPlayerId);
    if (!sourceTypesById.has(id)) sourceTypesById.set(id, []);
    sourceTypesById.get(id).push({ sourceType: source.sourceType });
  }
  const serialized = list.map(row => ({
    ...row.toJSON(),
    sources: sourceTypesById.get(Number(row.id)) || []
  }));
  return Array.isArray(rows) ? serialized : serialized[0];
};

const loadRelation = async (id, transaction) => {
  const relation = await SeasonTeamPlayer.findByPk(id, {
    include: [
      { model: SeasonTeam, attributes: ['id', 'seasonId', 'teamId'] },
      { model: Player, attributes: ['id', 'name', 'role'] }
    ],
    transaction
  });
  return attachSourceTypes(relation, transaction);
};

class SeasonTeamPlayerController {
  static async getAll(req, res) {
    try {
      const rows = await SeasonTeamPlayer.findAll({
        include: [
          { model: SeasonTeam, attributes: ['id', 'seasonId', 'teamId'] },
          { model: Player, attributes: ['id', 'name', 'role'] }
        ]
      });
      res.json(await attachSourceTypes(rows));
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
      const rows = await SeasonTeamPlayer.findAll({
        where: { seasonTeamId: req.params.seasonTeamId },
        include: [{ model: Player, attributes: ['id', 'name', 'role'] }]
      });
      res.json(await attachSourceTypes(rows));
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
