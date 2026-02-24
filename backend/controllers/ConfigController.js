const Config = require('../models/Config');

const ConfigController = {
  // 获取所有配置
  getAllConfigs: async (req, res) => {
    try {
      const configs = await Config.findAll();
      const configMap = {};
      configs.forEach(config => {
        configMap[config.key] = config.value;
      });
      res.json(configMap);
    } catch (error) {
      console.error('获取配置失败:', error);
      res.status(500).json({ error: '获取配置失败' });
    }
  },

  // 获取单个配置
  getConfig: async (req, res) => {
    try {
      const { key } = req.params;
      const config = await Config.findByPk(key);
      if (!config) {
        return res.status(404).json({ error: '配置未找到' });
      }
      res.json(config.value);
    } catch (error) {
      console.error('获取配置失败:', error);
      res.status(500).json({ error: '获取配置失败' });
    }
  },

  // 更新或创建配置
  updateConfig: async (req, res) => {
    try {
      console.log('[ConfigController] Update request:', req.body);
      const { key, value, description } = req.body;
      if (!key) {
        return res.status(400).json({ error: '配置键不能为空' });
      }

      const [config, created] = await Config.findOrCreate({
        where: { key },
        defaults: { value, description }
      });

      if (!created) {
        console.log('[ConfigController] Updating existing config');
        config.value = value;
        if (description) config.description = description;
        // 强制标记字段更新，确保 JSON 类型变更被检测到
        config.changed('value', true);
        await config.save();
      } else {
        console.log('[ConfigController] Created new config');
      }

      console.log('[ConfigController] Saved config:', config.toJSON());
      res.json({ message: '配置更新成功', config });
    } catch (error) {
      console.error('更新配置失败:', error);
      res.status(500).json({ error: '更新配置失败' });
    }
  }
};

module.exports = ConfigController;
