const Player = require('../models/Player');

const PlayerController = {
  // 获取所有选手
  getAll: async (req, res) => {
    try {
      const players = await Player.findAll();
      res.status(200).json(players);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取单个选手
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const player = await Player.findByPk(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      res.status(200).json(player);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建选手
  create: async (req, res) => {
    try {
      const player = await Player.create(req.body);
      res.status(201).json(player);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 更新选手
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const player = await Player.findByPk(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await player.update(req.body);
      res.status(200).json(player);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 删除选手
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const player = await Player.findByPk(id);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      await player.destroy();
      res.status(200).json({ message: 'Player deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = PlayerController;