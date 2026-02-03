const Season = require('../models/Season');

const SeasonController = {
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
    try {
      const { id } = req.params;
      const season = await Season.findByPk(id);
      if (!season) {
        return res.status(404).json({ error: 'Season not found' });
      }
      await season.destroy();
      res.status(200).json({ message: 'Season deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = SeasonController;