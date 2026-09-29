const service = require('../services/EntityMergeService');
const handler = (kind, apply) => async (req, res) => {
  try {
    const args = [kind, Number(req.params.id), Number(req.body?.targetId)];
    const result = apply ? await service.applyMerge(...args, req.body?.fingerprint) : await service.previewMerge(...args);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message, code: error.code, conflicts: error.conflicts });
  }
};
module.exports = { handler };
