const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonStageSnapshotTeamScoreStat = require('../models/SeasonStageSnapshotTeamScoreStat');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

const deletePlayerStats = async (where, transaction) => {
  const stats = await PlayerStat.findAll({ where, attributes: ['id'], transaction });
  const statIds = stats.map(stat => stat.id);
  if (statIds.length > 0) {
    await PlayerHeroStat.destroy({
      where: { playerStatId: { [Op.in]: statIds } },
      transaction
    });
  }
  return PlayerStat.destroy({ where, transaction });
};

const TeamController = {
  // 获取所有队伍
  getAll: async (req, res) => {
    try {
      const teams = await Team.findAll();
      res.status(200).json(teams);
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
      res.status(200).json(team);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建队伍
  create: async (req, res) => {
    try {
      const team = await Team.create(req.body);
      res.status(201).json(team);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 更新队伍
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const team = await Team.findByPk(id);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }
      await team.update(req.body);
      res.status(200).json(team);
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

      // Cascade delete other non-critical references
      
      // Get all match IDs associated with this team
      const matches = await Match.findAll({
        where: { [Op.or]: [{ team1Id: id }, { team2Id: id }, { winnerId: id }] },
        transaction: t
      });
      const matchIds = matches.map(m => m.id);

      if (matchIds.length > 0) {
        // Find all MapGames for these matches
        const mapGames = await MapGame.findAll({
          where: { matchId: { [Op.in]: matchIds } },
          transaction: t
        });
        const mapGameIds = mapGames.map(mg => mg.id);

        if (mapGameIds.length > 0) {
          // Delete PlayerStats associated with these MapGames
          await deletePlayerStats({ mapGameId: { [Op.in]: mapGameIds } }, t);
        }

        // Delete MapGames
        await MapGame.destroy({
          where: { matchId: { [Op.in]: matchIds } },
          transaction: t
        });

        // Delete Matches
        await Match.destroy({
          where: { id: { [Op.in]: matchIds } },
          transaction: t
        });
      }

      // We should also find any MapGames where the team is directly involved (just in case they are orphaned)
      const orphanMapGames = await MapGame.findAll({
        where: {
          matchId: null, // or whatever indicates orphan if any exist, but let's just match any MapGame by teamId
          [Op.or]: [{ team1Id: id }, { team2Id: id }, { winnerId: id }]
        },
        transaction: t
      });
      const orphanMapGameIds = orphanMapGames.map(mg => mg.id);
      
      if (orphanMapGameIds.length > 0) {
        await deletePlayerStats({ mapGameId: { [Op.in]: orphanMapGameIds } }, t);
        await MapGame.destroy({
          where: { id: { [Op.in]: orphanMapGameIds } },
          transaction: t
        });
      }

      // Delete any leftover PlayerStats directly tied to the team (just in case)
      await deletePlayerStats({ teamId: id }, t);

      // SeasonStageSnapshotTeamScoreStat
      await SeasonStageSnapshotTeamScoreStat.destroy({
        where: { teamId: id },
        transaction: t
      });

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

      // Delete the team itself
      await team.destroy({ transaction: t });

      await t.commit();
      res.status(200).json({ message: 'Team and related data deleted successfully' });
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
