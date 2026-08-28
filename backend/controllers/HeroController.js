const Hero = require('../models/Hero');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const MapGame = require('../models/MapGame');
const { Op } = require('sequelize');

const heroPayload = body => ({
  name: body?.name,
  role: body?.role,
  subRole: body?.subRole || null,
  ...(Object.prototype.hasOwnProperty.call(body || {}, 'image') ? { image: body.image || null } : {})
});

const HeroController = {
  // 获取所有英雄
  getAll: async (req, res) => {
    try {
      const heroes = await Hero.findAll({ order: [['role', 'ASC'], ['name', 'ASC']] });
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
      const hero = await Hero.create(heroPayload(req.body));
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
      await hero.update(heroPayload(req.body));
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
      const [playerStatsCount, heroStatsCount, bansCount] = await Promise.all([
        PlayerStat.count({ where: { heroId: id } }),
        PlayerHeroStat.count({ where: { heroId: id } }),
        MapGame.count({
          where: { [Op.or]: [{ team1BanHeroId: id }, { team2BanHeroId: id }] }
        })
      ]);
      if (playerStatsCount || heroStatsCount || bansCount) {
        return res.status(409).json({
          code: 'DATA_IN_USE',
          message: '该英雄仍被比赛数据引用，不能直接删除。',
          references: { playerStatsCount, heroStatsCount, bansCount }
        });
      }
      await hero.destroy();
      res.status(200).json({ message: 'Hero deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = HeroController;
