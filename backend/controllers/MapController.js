const Map = require('../models/Map');

const mapPayload = body => ({
  name: body?.name,
  type: body?.type,
  ...(Object.prototype.hasOwnProperty.call(body || {}, 'image') ? { image: body.image || null } : {})
});

const MapController = {
  // 获取所有地图
  getAll: async (req, res) => {
    try {
      const maps = await Map.findAll({ order: [['type', 'ASC'], ['name', 'ASC']] });
      res.status(200).json(maps);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取单个地图
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const map = await Map.findByPk(id);
      if (!map) {
        return res.status(404).json({ error: 'Map not found' });
      }
      res.status(200).json(map);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建地图
  create: async (req, res) => {
    try {
      const map = await Map.create(mapPayload(req.body));
      res.status(201).json(map);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 更新地图
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const map = await Map.findByPk(id);
      if (!map) {
        return res.status(404).json({ error: 'Map not found' });
      }
      await map.update(mapPayload(req.body));
      res.status(200).json(map);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 删除地图
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const map = await Map.findByPk(id);
      if (!map) {
        return res.status(404).json({ error: 'Map not found' });
      }
      await map.destroy();
      res.status(200).json({ message: 'Map deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = MapController;
