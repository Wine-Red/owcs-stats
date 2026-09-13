const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mysql = require('mysql2/promise');
const { migrateHeroIdentities } = require('../database/heroIdentityMigration');

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--apply') options.apply = true;
    else if (['--database', '--backup'].includes(key) && args[index + 1] && !args[index + 1].startsWith('--')) {
      options[key.slice(2)] = args[++index];
    } else throw new Error('Usage: --database <exact-name> [--apply --backup <new-file.json>]');
  }
  if (!options.database || (options.apply && !options.backup)) throw new Error('An exact database and an apply backup path are required');
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const result = await migrateHeroIdentities(connection, { expectedDatabase: options.database, dryRun: !options.apply,
      backup: snapshot => fs.writeFileSync(options.backup, JSON.stringify(snapshot, null, 2),
        { flag: 'wx', mode: 0o600, flush: true }) });
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
