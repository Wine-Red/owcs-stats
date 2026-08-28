const Season = require('../models/Season');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const SeasonStage = require('../models/SeasonStage');

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
      
      // 2. 获取关联的小局 ID（兼容旧数据中只写 seasonId 的记录）
      const mapGameConditions = [{ seasonId: id }];
      if (matchIds.length > 0) mapGameConditions.push({ matchId: { [Op.in]: matchIds } });
      const mapGames = await MapGame.findAll({
        where: { [Op.or]: mapGameConditions },
        attributes: ['id']
      });
      const mapGameIds = mapGames.map(mg => mg.id);
      
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
      
      // 6. 赛季统计已改为接口实时计算，无预聚合表数据需要删除
      const seasonPlayerStatsCount = 0;

      res.status(200).json({
        blocked: matchIds.length > 0 || mapGameIds.length > 0,
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

      const [matchesCount, mapGamesCount] = await Promise.all([
        Match.count({ where: { seasonId: id }, transaction }),
        MapGame.count({ where: { seasonId: id }, transaction })
      ]);
      if (matchesCount || mapGamesCount) {
        await transaction.rollback();
        return res.status(409).json({
          code: 'DATA_IN_USE',
          message: '该赛季仍包含比赛数据。比赛只能在 Matchweb 删除或修改后同步。',
          references: { matchesCount, mapGamesCount }
        });
      }

      const seasonTeams = await SeasonTeam.findAll({ where: { seasonId: id }, attributes: ['id'], transaction });
      const seasonTeamIds = seasonTeams.map(st => st.id);

      if (seasonTeamIds.length > 0) {
        await SeasonTeamPlayer.destroy({
          where: { seasonTeamId: { [Op.in]: seasonTeamIds } },
          transaction
        });
      }

      await SeasonTeam.destroy({
        where: { seasonId: id },
        transaction
      });
      await SeasonStage.destroy({ where: { seasonId: id }, transaction });
      await season.destroy({ transaction });

      await transaction.commit();
      res.status(200).json({ message: 'Season deleted successfully' });
    } catch (error) {
      await transaction.rollback();
      console.error('Delete season error:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = SeasonController;
