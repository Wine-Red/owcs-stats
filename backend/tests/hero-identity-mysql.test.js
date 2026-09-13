const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { migrateHeroIdentities } = require('../database/heroIdentityMigration');

const enabled = process.env.OWCS_ISOLATED_MYSQL === '1' && process.env.DATA_API_TEST_DB_PORT;
test('hero identity migration preserves real MySQL references and rolls back unsafe merges', { skip: !enabled }, async t => {
  const databaseName = `owcs_hero_test_${process.pid}_${Date.now()}`;
  assert.match(databaseName, /^owcs_hero_test_\d+_\d+$/);
  const connection = await mysql.createConnection({
    host: process.env.DATA_API_TEST_DB_HOST || '127.0.0.1', port: Number(process.env.DATA_API_TEST_DB_PORT),
    user: process.env.DATA_API_TEST_DB_USER || 'root', password: process.env.DATA_API_TEST_DB_PASSWORD || '',
    multipleStatements: true
  });
  t.after(async () => {
    await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await connection.end();
  });
  await connection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE \`${databaseName}\``);
  await connection.query(`
    CREATE TABLE heroes (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, externalId VARCHAR(80) UNIQUE,
      role VARCHAR(20), subRole VARCHAR(30), image VARCHAR(255)) ENGINE=InnoDB;
    CREATE TABLE player_stats (id INT PRIMARY KEY, heroId INT, kills INT, damage INT,
      FOREIGN KEY (heroId) REFERENCES heroes(id)) ENGINE=InnoDB;
    CREATE TABLE player_hero_stats (id INT PRIMARY KEY, playerStatId INT, heroId INT, heroName VARCHAR(100),
      heroExternalId VARCHAR(80), usageSeconds INT, finalBlows INT, avgUltChargeSeconds FLOAT,
      UNIQUE KEY (playerStatId, heroName), FOREIGN KEY (heroId) REFERENCES heroes(id),
      FOREIGN KEY (playerStatId) REFERENCES player_stats(id)) ENGINE=InnoDB;
    CREATE TABLE map_games (id INT PRIMARY KEY, team1BanHeroId INT, team2BanHeroId INT, duration FLOAT,
      FOREIGN KEY (team1BanHeroId) REFERENCES heroes(id), FOREIGN KEY (team2BanHeroId) REFERENCES heroes(id)) ENGINE=InnoDB;
    INSERT INTO heroes VALUES
      (1,'安娜','ana','support','战术','/ana.webp'),
      (34,'弗雷娅',NULL,'damage','侦察','/freja.webp'),
      (46,'布里吉塔',NULL,'support','生存','/brigitte.webp'),
      (54,'布丽吉塔','brigitte','damage',NULL,NULL),
      (55,'弗蕾娅','freja','damage',NULL,NULL);
    INSERT INTO player_stats VALUES (1,55,21,9123), (2,54,7,2345), (3,NULL,0,0);
    INSERT INTO player_hero_stats VALUES (1,1,55,'弗蕾娅','freja',850,13,85),
      (2,2,54,'布丽吉塔','brigitte',200,2,NULL), (3,3,NULL,'弗雷娅',NULL,10,0,0);
    INSERT INTO map_games VALUES (1,46,34,12.5),(2,55,54,9.2),(3,1,NULL,0);
  `);
  const state = async () => {
    const rows = {};
    for (const table of ['heroes', 'player_stats', 'player_hero_stats', 'map_games']) {
      [rows[table]] = await connection.query(`SELECT * FROM ${table} ORDER BY id`);
    }
    return rows;
  };
  const before = await state();
  const options = { expectedDatabase: databaseName, dryRun: false, backup: () => {} };

  await t.test('preview and database mismatch cannot change any data', async () => {
    assert.equal((await migrateHeroIdentities(connection, { expectedDatabase: databaseName })).changed, true);
    await assert.rejects(migrateHeroIdentities(connection, { ...options, expectedDatabase: 'owcs_stats' }), /identity mismatch/);
    assert.deepEqual(await state(), before);
  });
  await t.test('backup failure and ambiguous overlapping statistics leave all rows intact', async () => {
    await assert.rejects(migrateHeroIdentities(connection, { ...options, backup: () => { throw new Error('disk full'); } }), /disk full/);
    assert.deepEqual(await state(), before);
    await connection.query("INSERT INTO player_hero_stats VALUES (4,1,34,'弗雷娅',NULL,850,13,85)");
    const overlap = await state();
    await assert.rejects(migrateHeroIdentities(connection, options), /Overlapping hero statistics/);
    assert.deepEqual(await state(), overlap);
    await connection.query('DELETE FROM player_hero_stats WHERE id=4');
  });
  await t.test('a failure after the first merge rolls back references and the deleted hero', async () => {
    await connection.query("CREATE TRIGGER block_second_merge BEFORE UPDATE ON heroes FOR EACH ROW BEGIN IF OLD.id=46 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected write failure'; END IF; END");
    await assert.rejects(migrateHeroIdentities(connection, options), /injected write failure/);
    assert.deepEqual(await state(), before);
    await connection.query('DROP TRIGGER block_second_merge');
  });
  await t.test('both identities merge without changing metrics, roles, images or ban meaning', async () => {
    let snapshot;
    const result = await migrateHeroIdentities(connection, { ...options, backup: value => { snapshot = value; } });
    assert.equal(result.afterHeroCount, 3);
    assert.deepEqual(snapshot.heroes, before.heroes);
    const after = await state();
    assert.deepEqual(after.heroes, before.heroes.filter(hero => hero.id < 54).map(hero => hero.id === 34
      ? { ...hero, name: '弗蕾娅', externalId: 'freja' } : hero.id === 46
        ? { ...hero, name: '布丽吉塔', externalId: 'brigitte' } : hero));
    assert.deepEqual(after.player_stats, before.player_stats.map(row => ({ ...row, heroId: row.heroId === 55 ? 34 : row.heroId === 54 ? 46 : row.heroId })));
    assert.deepEqual(after.player_hero_stats, before.player_hero_stats.map(row => ({ ...row,
      heroId: row.id === 2 ? 46 : 34, heroName: row.id === 2 ? '布丽吉塔' : '弗蕾娅', heroExternalId: row.id === 2 ? 'brigitte' : 'freja' })));
    assert.deepEqual(after.map_games, before.map_games.map(row => row.id === 2 ? { ...row, team1BanHeroId: 34, team2BanHeroId: 46 } : row));
    assert.equal((await migrateHeroIdentities(connection, { ...options, backup: () => { throw new Error('must not need backup twice'); } })).changed, false);
    assert.deepEqual(await state(), after);
  });
});
