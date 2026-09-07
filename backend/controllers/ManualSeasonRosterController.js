const service = require('../services/ManualSeasonRosterService');

module.exports = {
  save: async (req, res) => {
    try {
      return res.json(await service.save(Number(req.params.id), req.body));
    } catch (error) {
      if (!error.statusCode) console.error('Manual season roster save failed:', error);
      return res.status(error.statusCode || 500).json({
        error: error.statusCode ? error.message : '保存失败，本次新建与关联均未写入。请检查服务状态后重试。'
      });
    }
  }
};
