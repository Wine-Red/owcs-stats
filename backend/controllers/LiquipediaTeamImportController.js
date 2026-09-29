const service = require('../services/LiquipediaTeamImportService');
const handle = action => async (req, res) => {
  const seasonId = Number(req.params.id);
  if (!Number.isSafeInteger(seasonId) || seasonId <= 0) return res.status(400).json({ error: '赛季 ID 无效' });
  try { return res.json(await action(seasonId, req.body || {})); }
  catch (error) {
    if (!error.statusCode) console.error('Liquipedia team import failed:', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : '队伍配置失败，本次未写入关联' });
  }
};
module.exports = { preview: handle(seasonId => service.preview(seasonId)),
  apply: handle((seasonId, body) => service.apply(seasonId, body.previewToken, body.excludedTeamLinks)) };
