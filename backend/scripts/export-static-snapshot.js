// Read-only CLI: register model relationships without initDatabase/migrations,
// application startup, sync jobs, poll reconciliation or vote identity writes.
const path = require('node:path');
const { writeFile, mkdir } = require('node:fs/promises');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
process.env.NODE_ENV = 'production';
const sequelize = require('../config/database');
const { setupAssociations } = require('../database');
const { buildStaticExportSnapshot } = require('../services/StaticExportSnapshotService');

(async () => {
  try {
    if (!process.argv[2]) throw new Error('Usage: node backend/scripts/export-static-snapshot.js OUTPUT.json');
    setupAssociations();
    const snapshot = await buildStaticExportSnapshot();
    snapshot.dataSource = { kind: 'database', database: sequelize.config.database };
    const output = path.resolve(process.argv[2]);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(snapshot));
    console.log(JSON.stringify({ output, generatedAt: snapshot.generatedAt, counts: snapshot.counts }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { await sequelize.close(); }
})();
