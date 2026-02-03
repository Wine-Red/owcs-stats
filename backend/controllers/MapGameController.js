const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');

const MapGameController = {
  // 获取所有地图局
  getAll: async (req, res) => {
    try {
      const mapGames = await MapGame.findAll({
        include: ['winner', 'map']
      });
      res.status(200).json(mapGames);
    } catch (error) {
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
    try {
      const mapGame = await MapGame.create(req.body);
      res.status(201).json(mapGame);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 更新地图局
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const mapGame = await MapGame.findByPk(id);
      if (!mapGame) {
        return res.status(404).json({ error: 'MapGame not found' });
      }
      await mapGame.update(req.body);
      res.status(200).json(mapGame);
    } catch (error) {
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
      const mapGame = await MapGame.findByPk(id);
      if (!mapGame) {
        return res.status(404).json({ error: 'MapGame not found' });
      }
      const playerStats = await PlayerStat.findAll({ 
        where: { mapGameId: id },
        include: ['player', 'hero', 'team']
      });
      res.status(200).json(playerStats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = MapGameController;