const test = require('node:test');
const assert = require('node:assert/strict');
const { LEGACY_AGENT_VIEWS, retireLegacyAgentViews } = require('../database/legacyAgentViewRetirement');

const fakeDatabase = ({ name = 'test', kind = 'VIEW', dependents = [] } = {}) => {
  let views = [...LEGACY_AGENT_VIEWS];
  const statements = [];
  return { statements, query: async sql => {
    statements.push(sql);
    if (sql.includes('VERSION()')) return [[{ database_name: name, version: '8.0.44', db_user: 'test@localhost' }]];
    if (sql.includes('information_schema.TABLES')) return [views.map(name => ({ name, kind }))];
    if (sql.includes('VIEW_TABLE_USAGE')) return [dependents];
    if (sql.startsWith('DROP VIEW')) { views = []; return [[]]; }
    throw new Error(`Unexpected query: ${sql}`);
  } };
};

test('retirement is scoped to exactly ten known views, verifies removal and is repeatable', async () => {
  const db = fakeDatabase();
  let backedUp = false;
  const result = await retireLegacyAgentViews(db, { expectedDatabase: 'test', beforeDrop: async data => {
    assert.equal(data.views.length, 10);
    assert.equal(db.statements.some(sql => sql.startsWith('DROP')), false);
    backedUp = true;
  } });
  assert.equal(backedUp, true);
  assert.equal(result.dropped.length, 10);
  assert.deepEqual(result.views, []);
  assert.deepEqual((await retireLegacyAgentViews(db)).dropped, []);
  const ddl = db.statements.filter(sql => sql.startsWith('DROP'));
  assert.equal(ddl.length, 1);
  assert.match(ddl[0], /^DROP VIEW IF EXISTS /);
  for (const name of LEGACY_AGENT_VIEWS) assert.ok(ddl[0].includes(`\`test\`.\`${name}\``));
  assert.doesNotMatch(ddl[0], /DROP TABLE|CREATE|\*/);
});

test('preview and failed identity, object-type, dependency or backup checks perform no DDL', async () => {
  const preview = fakeDatabase();
  assert.equal((await retireLegacyAgentViews(preview, { dryRun: true })).views.length, 10);
  assert.equal(preview.statements.some(sql => sql.startsWith('DROP')), false);
  for (const [db, options] of [
    [fakeDatabase(), { expectedDatabase: 'wrong' }], [fakeDatabase({ kind: 'BASE TABLE' }), {}],
    [fakeDatabase({ dependents: [{ view_schema: 'test', view_name: 'unrelated_view' }] }), {}],
    [fakeDatabase(), { beforeDrop: async () => { throw new Error('backup failed'); } }]
  ]) {
    await assert.rejects(retireLegacyAgentViews(db, options));
    assert.equal(db.statements.some(sql => sql.startsWith('DROP')), false);
  }
});
