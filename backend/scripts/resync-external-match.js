const sequelize = require('../config/database');
const { createIncrementalMatchSyncService } = require('../services/IncrementalMatchSyncService');

const externalMatchId = String(process.argv[2] || '').trim();

if (!externalMatchId) {
  console.error('Usage: node scripts/resync-external-match.js <external-match-id>');
  process.exit(2);
}

(async () => {
  const service = createIncrementalMatchSyncService();
  const result = await service.syncMatch(externalMatchId, { source: 'targeted-cli' });
  console.log(JSON.stringify(result));
  await sequelize.close();
})().catch(async error => {
  console.error(error);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
