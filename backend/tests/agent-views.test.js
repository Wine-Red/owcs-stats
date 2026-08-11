const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const {
  AGENT_VIEW_SQL_PATH,
  ensureAgentViews,
  parseAgentViewStatements
} = require('../database/agentViews');

test('agent view SQL contains only the approved live view definitions', () => {
  const sql = fs.readFileSync(AGENT_VIEW_SQL_PATH, 'utf8');
  const statements = parseAgentViewStatements(sql);

  assert.equal(statements.length, 10);
  for (const statement of statements) {
    assert.match(statement, /^CREATE OR REPLACE SQL SECURITY DEFINER VIEW\b/i);
  }
});

test('ensureAgentViews executes each view definition sequentially', async () => {
  const executed = [];
  const sequelize = {
    query: async statement => {
      executed.push(statement);
    }
  };

  const count = await ensureAgentViews(sequelize);

  assert.equal(count, 10);
  assert.equal(executed.length, 10);
  assert.match(executed[0], /VIEW `ai_v_seasons`/);
  assert.match(executed.at(-1), /VIEW `ai_v_data_freshness`/);
});
