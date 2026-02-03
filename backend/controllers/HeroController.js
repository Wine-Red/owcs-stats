const Hero = require('../models/Hero');

const HeroController = {
  // 获取所有英雄
  getAll: async (req, res) => {
    try {
      const heroes = await Hero.findAll();
      res.status(200).json(heroes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取单个英雄
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const hero = await Hero.findByPk(id);
      if (!hero) {
        return res.status(404).json({ error: 'Hero not found' });
      }
      res.status(200).json(hero);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建英雄
  create: async (req, res) => {
    try {
      const hero = await Hero.create(req.body);
      res.status(201).json(hero);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 更新英雄
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const hero = await Hero.findByPk(id);
      if (!hero) {
        return res.status(404).json({ error: 'Hero not found' });
      }
      await hero.update(req.body);
      res.status(200).json(hero);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 删除英雄
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const hero = await Hero.findByPk(id);
      if (!hero) {
        return res.status(404).json({ error: 'Hero not found' });
      }
      await hero.destroy();
      res.status(200).json({ message: 'Hero deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = HeroController;