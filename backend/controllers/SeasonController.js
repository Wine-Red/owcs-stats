const Season = require('../models/Season');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonPlayerStat = require('../models/SeasonPlayerStat');
const SeasonTeamScoreStat = require('../models/SeasonTeamScoreStat');
const SeasonMapPickStat = require('../models/SeasonMapPickStat');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

const SeasonController = {
  // 检查删除赛季前的影响
  preDeleteCheck: async (req, res) => {
    try {
      const { id } = req.params;
      
      // 1. 获取关联的比赛 ID
      const matches = await Match.findAll({
        where: { seasonId: id },
        attributes: ['id']
      });
      const matchIds = matches.map(m => m.id);
      
      // 2. 获取关联的小局 ID
      let mapGameIds = [];
      if (matchIds.length > 0) {
        const mapGames = await MapGame.findAll({
          where: { matchId: { [Op.in]: matchIds } },
          attributes: ['id']
        });
        mapGameIds = mapGames.map(mg => mg.id);
      }
      
      // 3. 计算将要删除的 PlayerStat 数量
      let playerStatsCount = 0;
      if (mapGameIds.length > 0) {
        playerStatsCount = await PlayerStat.count({
          where: { mapGameId: { [Op.in]: mapGameIds } }
        });
      }
      
      // 4. 计算将要删除的 SeasonTeam 数量
      const seasonTeams = await SeasonTeam.findAll({
        where: { seasonId: id },
        attributes: ['id']
      });
      const seasonTeamIds = seasonTeams.map(st => st.id);
      const seasonTeamsCount = seasonTeamIds.length;
      
      // 5. 计算将要删除的 SeasonTeamPlayer 数量
      let seasonTeamPlayersCount = 0;
      if (seasonTeamIds.length > 0) {
        seasonTeamPlayersCount = await SeasonTeamPlayer.count({
          where: { seasonTeamId: { [Op.in]: seasonTeamIds } }
        });
      }
      
      // 6. 计算将要删除的 SeasonPlayerStat 数量
      const seasonPlayerStatsCount = await SeasonPlayerStat.count({
        where: { seasonId: id }
      });

      res.status(200).json({
        matchesCount: matchIds.length,
        mapGamesCount: mapGameIds.length,
        playerStatsCount,
        seasonTeamsCount,
        seasonTeamPlayersCount,
        seasonPlayerStatsCount
      });
    } catch (error) {
      console.error('Pre-delete check error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // 获取所有赛季
  getAll: async (req, res) => {
    try {
      const seasons = await Season.findAll();
      res.status(200).json(seasons);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取单个赛季
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const season = await Season.findByPk(id);
      if (!season) {
        return res.status(404).json({ error: 'Season not found' });
      }
      res.status(200).json(season);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建赛季
  create: async (req, res) => {
    try {
      const season = await Season.create(req.body);
      res.status(201).json(season);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 更新赛季
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const season = await Season.findByPk(id);
      if (!season) {
        return res.status(404).json({ error: 'Season not found' });
      }
      await season.update(req.body);
      res.status(200).json(season);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 删除赛季
  delete: async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const season = await Season.findByPk(id);
      if (!season) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Season not found' });
      }

      // 1. 获取关联数据 ID
      const matches = await Match.findAll({ where: { seasonId: id }, attributes: ['id'], transaction });
      const matchIds = matches.map(m => m.id);

      let mapGameIds = [];
      if (matchIds.length > 0) {
        const mapGames = await MapGame.findAll({
          where: { matchId: { [Op.in]: matchIds } },
          attributes: ['id'],
          transaction
        });
        mapGameIds = mapGames.map(mg => mg.id);
      }

      const seasonTeams = await SeasonTeam.findAll({ where: { seasonId: id }, attributes: ['id'], transaction });
      const seasonTeamIds = seasonTeams.map(st => st.id);

      // 2. 按顺序删除数据
      // 2.1 删除 PlayerStats (依赖 MapGame)
      if (mapGameIds.length > 0) {
        await PlayerStat.destroy({
          where: { mapGameId: { [Op.in]: mapGameIds } },
          transaction
        });
      }

      // 2.2 删除 MapGames (依赖 Match)
      if (matchIds.length > 0) {
        await MapGame.destroy({
          where: { matchId: { [Op.in]: matchIds } },
          transaction
        });
      }

      // 2.3 删除 Matches (依赖 Season)
      await Match.destroy({
        where: { seasonId: id },
        transaction
      });

      // 2.4 删除 SeasonTeamPlayers (依赖 SeasonTeam)
      if (seasonTeamIds.length > 0) {
        await SeasonTeamPlayer.destroy({
          where: { seasonTeamId: { [Op.in]: seasonTeamIds } },
          transaction
        });
      }

      // 2.5 删除 SeasonTeams (依赖 Season)
      await SeasonTeam.destroy({
        where: { seasonId: id },
        transaction
      });

      // 2.6 删除 SeasonPlayerStats (依赖 Season)
      await SeasonPlayerStat.destroy({
        where: { seasonId: id },
        transaction
      });

      // 2.7 删除赛季比分与地图选取统计（新表，依赖 Season）
      await SeasonTeamScoreStat.destroy({
        where: { seasonId: id },
        transaction
      });
      await SeasonMapPickStat.destroy({
        where: { seasonId: id },
        transaction
      });

      // 2.8 删除 Season
      await season.destroy({ transaction });

      await transaction.commit();
      res.status(200).json({ message: 'Season and all related data deleted successfully' });
    } catch (error) {
      await transaction.rollback();
      console.error('Delete season error:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = SeasonController;
