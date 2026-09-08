// Explicit maintenance entrypoint: no app initialization or match synchronization.
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mysql = require('mysql2/promise');
const { quoteIdentifier, retireLegacyAgentViews } = require('../database/legacyAgentViewRetirement');

const main = async () => {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--apply') options.apply = true;
    else if (['--database', '--backup'].includes(key) && args[index + 1] && !args[index + 1].startsWith('--')) options[key.slice(2)] = args[++index];
    else throw new Error('Usage: --database <exact-name> [--apply --backup <new-file.json>]');
  }
  if (!options.database || (options.apply && !options.backup)) throw new Error('An exact database name is required; --apply also requires a backup file.');
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, multipleStatements: false });
  try {
    const result = await retireLegacyAgentViews(connection, {
      expectedDatabase: options.database, dryRun: !options.apply,
      beforeDrop: async inventory => {
        const definitions = [];
        for (const view of inventory.views) {
          const [rows] = await connection.query(`SHOW CREATE VIEW ${quoteIdentifier(inventory.identity.database_name)}.${quoteIdentifier(view)}`);
          definitions.push({ name: view, definition: rows[0]['Create View'] });
        }
        fs.writeFileSync(options.backup, JSON.stringify({ ...inventory, definitions }, null, 2), { flag: 'wx', mode: 0o600 });
      }
    });
    console.log(JSON.stringify({ mode: options.apply ? 'applied' : 'preview', ...result }, null, 2));
  } finally { await connection.end(); }
};
main().catch(error => { console.error(error.message); process.exitCode = 1; });
