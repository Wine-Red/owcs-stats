const fs = require('fs');
const path = require('path');

const AGENT_VIEW_SQL_PATH = path.join(__dirname, 'agent-views.sql');

const parseAgentViewStatements = sql => sql
  .replace(/^\s*--.*$/gm, '')
  .split(/;\s*(?:\r?\n|$)/)
  .map(statement => statement.trim())
  .filter(Boolean);

const ensureAgentViews = async sequelize => {
  const sql = fs.readFileSync(AGENT_VIEW_SQL_PATH, 'utf8');
  const statements = parseAgentViewStatements(sql);

  for (const statement of statements) {
    if (!/^CREATE\s+OR\s+REPLACE\s+SQL\s+SECURITY\s+DEFINER\s+VIEW\b/i.test(statement)) {
      throw new Error('agent-views.sql contains a statement that is not an approved view definition');
    }
    await sequelize.query(statement);
  }

  return statements.length;
};

module.exports = {
  AGENT_VIEW_SQL_PATH,
  ensureAgentViews,
  parseAgentViewStatements
};
