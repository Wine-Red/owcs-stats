const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const Team = require('../models/Team');
const Map = require('../models/Map');
const Player = require('../models/Player');
const Hero = require('../models/Hero');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

const MapGameController = {
  // 获取所有地图局
  getAll: async (req, res) => {
    try {
      const { seasonId, teamId, mapId, startDate, endDate, page = 1, pageSize = 10 } = req.query;
      
      // 构建筛选条件
      const where = {};
      if (seasonId) {
        where.seasonId = parseInt(seasonId);
      }
      if (teamId) {
        where[Op.or] = [
          { team1Id: parseInt(teamId) },
          { team2Id: parseInt(teamId) }
        ];
      }
      if (mapId) {
        where.mapId = parseInt(mapId);
      }
      if (startDate) {
        where.createdAt = {
          [Op.gte]: new Date(startDate)
        };
      }
      if (endDate) {
        where.createdAt = {
          ...where.createdAt,
          [Op.lte]: new Date(endDate)
        };
      }
      
      const mapGames = await MapGame.findAll({
        where,
        include: [
          { model: Team, as: 'winner' },
          { model: Map }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize)
      });
      
      res.status(200).json(mapGames);
    } catch (error) {
      console.error('获取地图局数据失败:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // 获取单个地图局
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const mapGame = await MapGame.findByPk(id, {
        include: ['winner', 'map']
      });
      if (!mapGame) {
        return res.status(404).json({ error: 'MapGame not found' });
      }
      res.status(200).json(mapGame);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建地图局
  create: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { playerStats, ...mapGameData } = req.body;
      const mapGame = await MapGame.create(mapGameData, { transaction: t });

      if (playerStats && Array.isArray(playerStats) && playerStats.length > 0) {
        const statsWithMapGameId = playerStats.map(stat => ({
          ...stat,
          mapGameId: mapGame.id
        }));
        await PlayerStat.bulkCreate(statsWithMapGameId, { transaction: t });
      }

      await t.commit();
      res.status(201).json(mapGame);
    } catch (error) {
      await t.rollback();
      res.status(400).json({ error: error.message });
    }
  },

  // 更新地图局
  update: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { playerStats, ...mapGameData } = req.body;
      
      const mapGame = await MapGame.findByPk(id);
      if (!mapGame) {
        await t.rollback();
        return res.status(404).json({ error: 'MapGame not found' });
      }
      
      await mapGame.update(mapGameData, { transaction: t });

      if (playerStats && Array.isArray(playerStats)) {
        await PlayerStat.destroy({ where: { mapGameId: id }, transaction: t });
        
        const statsWithMapGameId = playerStats.map(stat => ({
          ...stat,
          mapGameId: id
        }));
        await PlayerStat.bulkCreate(statsWithMapGameId, { transaction: t });
      }

      await t.commit();
      res.status(200).json(mapGame);
    } catch (error) {
      await t.rollback();
      res.status(400).json({ error: error.message });
    }
  },

  // 删除地图局
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const mapGame = await MapGame.findByPk(id);
      if (!mapGame) {
        return res.status(404).json({ error: 'MapGame not found' });
      }
      // 删除关联的选手统计数据
      await PlayerStat.destroy({ where: { mapGameId: id } });
      // 删除地图局
      await mapGame.destroy();
      res.status(200).json({ message: 'MapGame deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取地图局的选手数据
  getPlayerStats: async (req, res) => {
    try {
      const { id } = req.params;
      console.log('获取地图局选手数据，ID:', id);
      
      const mapGame = await MapGame.findByPk(id);
      if (!mapGame) {
        console.log('地图局不存在，ID:', id);
        return res.status(404).json({ error: 'MapGame not found' });
      }
      
      console.log('开始查询选手统计数据');
      let playerStats = [];
      try {
        playerStats = await PlayerStat.findAll({ 
          where: { mapGameId: id },
          include: [
            { model: Player, as: 'player' },
            { model: Hero, as: 'hero' },
            { model: Team, as: 'team' }
          ]
        });
        console.log('查询到选手统计数据:', playerStats.length, '条');
      } catch (dbError) {
        console.error('查询选手统计数据时出错:', dbError);
        // 即使查询失败，也返回空数组，而不是抛出错误
        playerStats = [];
      }
      
      res.status(200).json(playerStats);
    } catch (error) {
      console.error('获取地图局选手数据失败:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = MapGameController;