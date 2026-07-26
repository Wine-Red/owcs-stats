const { buildStaticExportSnapshot } = require('../services/StaticExportSnapshotService');

const CACHE_TTL_MS = 60 * 1000;
let cachedSnapshot = null;
let cachedAt = 0;
let buildPromise = null;

const getSnapshot = async () => {
  if (cachedSnapshot && Date.now() - cachedAt < CACHE_TTL_MS) return cachedSnapshot;
  if (!buildPromise) {
    buildPromise = buildStaticExportSnapshot()
      .then(snapshot => {
        cachedSnapshot = snapshot;
        cachedAt = Date.now();
        return snapshot;
      })
      .finally(() => {
        buildPromise = null;
      });
  }
  return buildPromise;
};

const StaticExportController = {
  getSnapshot: async (req, res) => {
    try {
      const snapshot = await getSnapshot();
      res.set('Cache-Control', 'no-store');
      return res.json(snapshot);
    } catch (error) {
      console.error('[static-export] Failed to build server-side snapshot:', error);
      return res.status(500).json({ error: 'Failed to build static export snapshot' });
    }
  }
};

module.exports = StaticExportController;
