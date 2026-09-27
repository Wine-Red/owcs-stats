const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTeamLiquipediaUrl, teamLiquipediaPayload, planTeamLiquipediaBackfill } = require('../services/TeamLiquipediaLink');
const { ensureTeamLiquipediaSchema } = require('../database/teamLiquipediaSchema');

test('team links normalize article URLs and reject unrelated or unsafe URLs', () => {
  assert.equal(normalizeTeamLiquipediaUrl('http://www.liquipedia.net/overwatch/Team_Liquid#Roster'), 'https://liquipedia.net/overwatch/Team_Liquid');
  assert.equal(normalizeTeamLiquipediaUrl('https://liquipedia.net/overwatch/index.php?title=Team%20Liquid'), 'https://liquipedia.net/overwatch/Team_Liquid');
  for (const url of ['javascript:alert(1)', 'https://liquipedia.net.evil.test/overwatch/Team_Liquid', 'https://liquipedia.net/counterstrike/Team_Liquid', 'https://x@liquipedia.net/overwatch/Team_Liquid', 'https://liquipedia.net/overwatch/api.php', {}]) {
    assert.throws(() => normalizeTeamLiquipediaUrl(url));
  }
});

test('omitted fields preserve saved links while explicit blanks clear them', () => {
  assert.deepEqual(teamLiquipediaPayload({ name: 'TL' }), {});
  assert.deepEqual(teamLiquipediaPayload({ liquipediaUrl: ' ' }), { liquipediaUrl: null });
  assert.deepEqual(teamLiquipediaPayload({ liquipediaUrl: null }), { liquipediaUrl: null });
});

test('schema upgrade is additive, repeatable and leaves fresh databases to model sync', async () => {
  const columns = {}; const calls = [];
  const query = { showAllTables: async () => ['teams'], describeTable: async () => columns,
    addColumn: async (table, name, definition) => { calls.push({ table, name, definition }); columns[name] = definition; } };
  const db = { getQueryInterface: () => query };
  await ensureTeamLiquipediaSchema(db);
  await ensureTeamLiquipediaSchema(db);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].definition.allowNull, true);
  query.showAllTables = async () => [];
  await ensureTeamLiquipediaSchema(db);
  assert.equal(calls.length, 1);
});

test('backfill rejects stale identities and existing conflicts, and is idempotent', () => {
  const entry = { teamId: 5, name: 'TL', liquipediaUrl: 'https://liquipedia.net/overwatch/Team_Liquid', pageId: 123, evidence: ['tournament participant card'] };
  assert.equal(planTeamLiquipediaBackfill([{ id: 5, name: 'TL' }], [entry])[0].changed, true);
  assert.equal(planTeamLiquipediaBackfill([{ id: 5, name: 'TL', liquipediaUrl: entry.liquipediaUrl }], [entry])[0].changed, false);
  assert.throws(() => planTeamLiquipediaBackfill([{ id: 5, name: 'Other' }], [entry]), /identity/);
  assert.throws(() => planTeamLiquipediaBackfill([{ id: 5, name: 'TL', liquipediaUrl: 'https://liquipedia.net/overwatch/T1' }], [entry]), /conflicts/);
  assert.throws(() => planTeamLiquipediaBackfill([{ id: 5, name: 'TL' }], [entry, entry]), /duplicated/);
  assert.throws(() => planTeamLiquipediaBackfill([{ id: 5, name: 'TL' }], [{ ...entry, pageId: null }]), /evidence/);
});
