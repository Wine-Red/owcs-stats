const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Sequelize, DataTypes } = require('sequelize');
const { ensureTeamLiquipediaSchema } = require('../database/teamLiquipediaSchema');
const { prepareTeamLiquipediaPayload, serializeTeamLiquipedia } = require('../services/TeamLiquipediaLink');

test('MySQL team page migration, persistence, legacy updates and concurrent ownership', { skip: process.env.TEAM_LINKS_TEST_MYSQL !== '1' }, async t => {
  const env = require('dotenv').parse(await fs.readFile(path.join(__dirname, '../.env')));
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(env.DB_HOST));
  assert.equal(env.DB_NAME, 'localstats');
  const database = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
    host: env.DB_HOST, port: Number(env.DB_PORT || 3306), dialect: 'mysql', logging: false
  });
  const tableName = `team_links_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const columns = { id: { type: DataTypes.INTEGER, primaryKey: true }, name: DataTypes.STRING,
    liquipediaUrl: DataTypes.STRING(1024) };
  const model = database.define('TeamLinksTest', { ...columns, liquipediaUrls: DataTypes.JSON }, { tableName, timestamps: false });
  t.after(async () => { try { await model.drop(); } finally { await database.close(); } });
  const query = database.getQueryInterface();
  await query.createTable(tableName, columns);
  const primary = 'https://liquipedia.net/overwatch/All_Gamers';
  const secondary = 'https://liquipedia.net/overwatch/All_Gamers_Global';
  await query.bulkInsert(tableName, [{ id: 1, name: 'AG.AL', liquipediaUrl: primary }, { id: 2, name: 'Other', liquipediaUrl: null }]);
  const save = (teamId, body) => database.transaction(async transaction => {
    const links = await prepareTeamLiquipediaPayload(body, { teamId, transaction, model });
    const team = await model.findByPk(teamId, { transaction });
    await team.update({ ...(body.name ? { name: body.name } : {}), ...links }, { transaction });
    return serializeTeamLiquipedia(team);
  });
  await t.test('additive migration preserves old primary pages and is repeatable', async () => {
    await ensureTeamLiquipediaSchema(database, { tableName });
    await ensureTeamLiquipediaSchema(database, { tableName });
    assert.equal((await model.findByPk(1)).liquipediaUrls, null);
    assert.deepEqual(serializeTeamLiquipedia(await model.findByPk(1)).liquipediaUrls, [primary]);
    assert.equal(await model.count(), 2);
  });
  await t.test('multiple pages survive reload, renaming and legacy client updates', async () => {
    await save(1, { liquipediaUrls: [primary, secondary] });
    assert.deepEqual((await model.findByPk(1)).liquipediaUrls, [primary, secondary]);
    await save(1, { name: 'Renamed' });
    assert.deepEqual((await save(1, { liquipediaUrl: primary })).liquipediaUrls, [primary, secondary]);
    await assert.rejects(save(2, { name: 'Should roll back', liquipediaUrls: [secondary] }), /已绑定队伍“Renamed”/);
    assert.equal((await model.findByPk(2)).name, 'Other');
  });
  await t.test('concurrent saves cannot claim the same page for different teams', async () => {
    const shared = 'https://liquipedia.net/overwatch/Shared_Page';
    const results = await Promise.allSettled([
      save(1, { liquipediaUrls: [primary, secondary, shared] }), save(2, { liquipediaUrls: [shared] })
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.match(results.find(r => r.status === 'rejected').reason.message, /已绑定队伍/);
    const teams = (await model.findAll()).map(serializeTeamLiquipedia);
    assert.equal(teams.filter(team => team.liquipediaUrls.includes(shared)).length, 1);
  });
  await t.test('explicit removal clears both representations and releases ownership', async () => {
    await save(1, { liquipediaUrls: [] });
    assert.equal((await model.findByPk(1)).liquipediaUrl, null);
    assert.deepEqual(serializeTeamLiquipedia(await model.findByPk(1)).liquipediaUrls, []);
    assert.deepEqual((await save(2, { liquipediaUrls: [secondary] })).liquipediaUrls, [secondary]);
  });
});
