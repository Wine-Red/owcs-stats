const Team = require('../models/Team');
const Player = require('../models/Player');

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
    try {
      const { id } = req.params;
      const team = await Team.findByPk(id);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }
      await team.destroy();
      res.status(200).json({ message: 'Team deleted successfully' });
    } catch (error) {
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
      const players = await Player.findAll({ where: { teamId: id } });
      res.status(200).json(players);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = TeamController;