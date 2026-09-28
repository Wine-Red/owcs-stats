const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTeamLiquipediaUrl, normalizeTeamLiquipediaUrls, getTeamLiquipediaUrls, serializeTeamLiquipedia,
  teamLiquipediaPayload, assertTeamLiquipediaAvailable, prepareTeamLiquipediaPayload, planTeamLiquipediaBackfill } = require('../services/TeamLiquipediaLink');
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
  assert.deepEqual(teamLiquipediaPayload({ liquipediaUrl: ' ' }), { liquipediaUrl: null, liquipediaUrls: [] });
  assert.deepEqual(teamLiquipediaPayload({ liquipediaUrl: null }), { liquipediaUrl: null, liquipediaUrls: [] });
});

const primary = 'https://liquipedia.net/overwatch/All_Gamers';
const secondary = 'https://liquipedia.net/overwatch/All_Gamers_Global';
test('multiple pages normalize and deduplicate; legacy rows and clients preserve extra pages', () => {
  const current = { id: 2, name: 'AG.AL', liquipediaUrl: primary, liquipediaUrls: [primary, secondary] };
  assert.deepEqual(normalizeTeamLiquipediaUrls([primary, 'http://www.liquipedia.net/overwatch/All_Gamers#Roster', secondary, '']), [primary, secondary]);
  assert.throws(() => normalizeTeamLiquipediaUrls(primary), /链接列表/);
  assert.throws(() => normalizeTeamLiquipediaUrls([primary, 'https://example.com/AG']), /有效/);
  assert.deepEqual(getTeamLiquipediaUrls({ liquipediaUrl: primary }), [primary]);
  assert.deepEqual(serializeTeamLiquipedia({ liquipediaUrl: primary }).liquipediaUrls, [primary]);
  assert.deepEqual(teamLiquipediaPayload({ name: 'Renamed' }, current), {});
  assert.deepEqual(teamLiquipediaPayload({ liquipediaUrl: primary }, current).liquipediaUrls, [primary, secondary]);
  const replacement = 'https://liquipedia.net/overwatch/New_Name';
  assert.deepEqual(teamLiquipediaPayload({ liquipediaUrl: replacement }, current).liquipediaUrls, [replacement, secondary]);
  assert.deepEqual(teamLiquipediaPayload({ liquipediaUrls: [secondary], liquipediaUrl: primary }, current), { liquipediaUrl: secondary, liquipediaUrls: [secondary] });
  assert.deepEqual(teamLiquipediaPayload({ liquipediaUrls: [] }, current), { liquipediaUrl: null, liquipediaUrls: [] });
  assert.deepEqual(current.liquipediaUrls, [primary, secondary]);
});

test('page ownership checks both primary and additional URLs and reports the owning team', async () => {
  const teams = [{ id: 2, name: 'AG.AL', liquipediaUrl: primary, liquipediaUrls: [primary, secondary] }];
  assert.doesNotThrow(() => assertTeamLiquipediaAvailable([secondary], teams, 2));
  assert.throws(() => assertTeamLiquipediaAvailable([secondary], teams, 3), /已绑定队伍“AG.AL”/);
  assert.throws(() => assertTeamLiquipediaAvailable(['http://www.liquipedia.net/overwatch/All_Gamers#Roster'], teams), /AG.AL/);
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const model = { findAll: async options => {
    assert.equal(options.transaction, transaction); assert.equal(options.lock, 'UPDATE');
    assert.deepEqual(options.order, [['id', 'ASC']]); return teams;
  } };
  await assert.rejects(prepareTeamLiquipediaPayload({ liquipediaUrls: [secondary] }, { teamId: 3, model, transaction }), /AG.AL/);
  assert.deepEqual((await prepareTeamLiquipediaPayload({ liquipediaUrl: primary }, { teamId: 2, model, transaction })).liquipediaUrls, [primary, secondary]);
});

test('schema upgrade is additive, repeatable and leaves fresh databases to model sync', async () => {
  const columns = {}; const calls = [];
  const query = { showAllTables: async () => ['teams'], describeTable: async () => columns,
    addColumn: async (table, name, definition) => { calls.push({ table, name, definition }); columns[name] = definition; } };
  const db = { getQueryInterface: () => query };
  await ensureTeamLiquipediaSchema(db);
  await ensureTeamLiquipediaSchema(db);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].definition.allowNull, true);
  query.showAllTables = async () => [];
  await ensureTeamLiquipediaSchema(db);
  assert.equal(calls.length, 2);
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
