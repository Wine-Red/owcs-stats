const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const TeamAlias = require('../models/TeamAlias');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const {
  validateTeamIdentity,
  replaceTeamAliases,
  serializeTeamsWithAliases
} = require('../services/TeamAliasService');

const teamPayload = body => ({
  name: body?.name,
  region: body?.region,
  ...(Object.prototype.hasOwnProperty.call(body || {}, 'logo') ? { logo: body.logo || null } : {})
});

const TeamController = {
  // 获取所有队伍
  getAll: async (req, res) => {
    try {
      const teams = await Team.findAll({ order: [['name', 'ASC']] });
      res.status(200).json(await serializeTeamsWithAliases(teams));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取单个队伍
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const team = await Team.findByPk(id);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }
      res.status(200).json(await serializeTeamsWithAliases(team));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建队伍
  create: async (req, res) => {
    try {
      const result = await sequelize.transaction(async transaction => {
        const identity = await validateTeamIdentity({
          name: req.body?.name,
          aliases: req.body?.aliases || [],
          transaction
        });
        const team = await Team.create({ ...teamPayload(req.body), name: identity.name }, { transaction });
        await replaceTeamAliases(team.id, identity.aliases, transaction);
        return serializeTeamsWithAliases(team, transaction);
      });
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 更新队伍
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await sequelize.transaction(async transaction => {
        const team = await Team.findByPk(id, { transaction });
        if (!team) return null;
        const current = await serializeTeamsWithAliases(team, transaction);
        const identity = await validateTeamIdentity({
          teamId: team.id,
          name: req.body?.name,
          aliases: Object.prototype.hasOwnProperty.call(req.body || {}, 'aliases')
            ? req.body.aliases
            : current.aliases,
          transaction
        });
        await team.update({ ...teamPayload(req.body), name: identity.name }, { transaction });
        await replaceTeamAliases(team.id, identity.aliases, transaction);
        return serializeTeamsWithAliases(team, transaction);
      });
      if (!result) return res.status(404).json({ error: 'Team not found' });
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 删除队伍
  delete: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const team = await Team.findByPk(id, { transaction: t });
      if (!team) {
        await t.rollback();
        return res.status(404).json({ error: 'Team not found' });
      }

      const [matchesCount, mapGamesCount, playerStatsCount] = await Promise.all([
        Match.count({
          where: { [Op.or]: [{ team1Id: id }, { team2Id: id }, { winnerId: id }] },
          transaction: t
        }),
        MapGame.count({
          where: { [Op.or]: [{ team1Id: id }, { team2Id: id }, { winnerId: id }] },
          transaction: t
        }),
        PlayerStat.count({ where: { teamId: id }, transaction: t })
      ]);
      if (matchesCount || mapGamesCount || playerStatsCount) {
        await t.rollback();
        return res.status(409).json({
          code: 'DATA_IN_USE',
          message: '该队伍仍被比赛数据引用。比赛只能在 Matchweb 删除或修改后同步。',
          references: { matchesCount, mapGamesCount, playerStatsCount }
        });
      }

      // SeasonTeamPlayer (must be deleted before SeasonTeam and Player)
      const seasonTeams = await SeasonTeam.findAll({
        where: { teamId: id },
        transaction: t
      });
      const seasonTeamIds = seasonTeams.map(st => st.id);
      
      if (seasonTeamIds.length > 0) {
        await SeasonTeamPlayer.destroy({
          where: { seasonTeamId: { [Op.in]: seasonTeamIds } },
          transaction: t
        });
      }

      // SeasonTeam
      await SeasonTeam.destroy({
        where: { teamId: id },
        transaction: t
      });

      await TeamAlias.destroy({ where: { teamId: id }, transaction: t });

      // Delete the team itself
      await team.destroy({ transaction: t });

      await t.commit();
      res.status(200).json({ message: 'Team deleted successfully' });
    } catch (error) {
      await t.rollback();
      res.status(500).json({ error: error.message });
    }
  },

  // 获取队伍的选手
  getPlayers: async (req, res) => {
    try {
      const { id } = req.params;
      const team = await Team.findByPk(id);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }
      const seasonTeams = await SeasonTeam.findAll({
        where: { teamId: id },
        attributes: ['id']
      });
      const seasonTeamIds = seasonTeams.map(seasonTeam => seasonTeam.id);
      if (seasonTeamIds.length === 0) {
        return res.status(200).json([]);
      }
      const memberships = await SeasonTeamPlayer.findAll({
        where: { seasonTeamId: { [Op.in]: seasonTeamIds } },
        include: [{ model: Player }]
      });
      const players = [...new Map(
        memberships
          .filter(membership => membership.Player)
          .map(membership => [membership.Player.id, membership.Player])
      ).values()];
      res.status(200).json(players);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = TeamController;
