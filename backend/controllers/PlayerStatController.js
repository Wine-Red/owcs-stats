const PlayerStat = require('../models/PlayerStat');

const PlayerStatController = {
  // 获取所有选手统计数据
  getAll: async (req, res) => {
    try {
      const playerStats = await PlayerStat.findAll({
        include: ['player', 'hero', 'team']
      });
      res.status(200).json(playerStats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取单个选手统计数据
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const playerStat = await PlayerStat.findByPk(id, {
        include: ['player', 'hero', 'team']
      });
      if (!playerStat) {
        return res.status(404).json({ error: 'PlayerStat not found' });
      }
      res.status(200).json(playerStat);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建选手统计数据
  create: async (req, res) => {
    try {
      const playerStat = await PlayerStat.create(req.body);
      res.status(201).json(playerStat);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 更新选手统计数据
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const playerStat = await PlayerStat.findByPk(id);
      if (!playerStat) {
        return res.status(404).json({ error: 'PlayerStat not found' });
      }
      await playerStat.update(req.body);
      res.status(200).json(playerStat);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 删除选手统计数据
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const playerStat = await PlayerStat.findByPk(id);
      if (!playerStat) {
        return res.status(404).json({ error: 'PlayerStat not found' });
      }
      await playerStat.destroy();
      res.status(200).json({ message: 'PlayerStat deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = PlayerStatController;