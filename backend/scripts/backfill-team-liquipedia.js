// Run from the backend directory. Defaults to a read-only preview.
// node scripts/backfill-team-liquipedia.js --input verified.json [--apply --backup /path/to/backup.json]
const fs = require('fs/promises');
const path = require('path');
const sequelize = require('../config/database');
const Team = require('../models/Team');
const { planTeamLiquipediaBackfill } = require('../services/TeamLiquipediaLink');

const main = async () => {
  const args = process.argv.slice(2);
  const option = key => args[args.indexOf(key) + 1];
  if (!args.includes('--input') || !option('--input')) throw new Error('--input is required');
  const input = JSON.parse(await fs.readFile(option('--input'), 'utf8'));
  const apply = args.includes('--apply');
  if (apply && (!args.includes('--backup') || !option('--backup'))) throw new Error('--backup is required with --apply');
  await sequelize.transaction(async transaction => {
    const teams = await Team.findAll({ transaction, ...(apply ? { lock: transaction.LOCK.UPDATE } : {}) });
    const plan = planTeamLiquipediaBackfill(teams, input.entries);
    const changes = plan.filter(row => row.changed);
    if (apply && changes.length) {
      const backup = path.resolve(option('--backup'));
      await fs.mkdir(path.dirname(backup), { recursive: true });
      // Refuse to overwrite any earlier backup. Write it before the first mutation.
      await fs.writeFile(backup, JSON.stringify({ at: new Date().toISOString(), plan, source: input }, null, 2), { flag: 'wx', mode: 0o600 });
      for (const row of changes) {
        await teams.find(team => Number(team.id) === Number(row.teamId)).update({ liquipediaUrl: row.after }, { transaction });
      }
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', total: teams.length, changed: changes.length, unchanged: plan.length - changes.length, unlisted: teams.length - plan.length, plan }, null, 2));
  });
};

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
