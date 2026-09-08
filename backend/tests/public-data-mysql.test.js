const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const express = require('express');
const { createReadDatabase } = require('../services/publicData/database');
const { createPublicDataService } = require('../services/publicData/service');
const { createCursorCodec } = require('../services/publicData/cursor');
const { createDataRouter } = require('../routes/data-v1');

const enabled = process.env.OWCS_ISOLATED_MYSQL === '1' && process.env.DATA_API_TEST_DB_PORT;
test('public data API against isolated MySQL tables and real HTTP', { skip: !enabled }, async t => {
  // Never derive this connection from the application's DB_* credentials.
  const config = { host: process.env.DATA_API_TEST_DB_HOST || '127.0.0.1', port: Number(process.env.DATA_API_TEST_DB_PORT),
    user: process.env.DATA_API_TEST_DB_USER || 'root', password: process.env.DATA_API_TEST_DB_PASSWORD || '', dateStrings: true };
  const databaseName = `owcs_data_api_test_${process.pid}_${Date.now()}`;
  assert.match(databaseName, /^owcs_data_api_test_\d+_\d+$/);
  const admin = await mysql.createConnection({ ...config, multipleStatements: true });
  const database = createReadDatabase({ ...config, database: databaseName });
  let server, writer;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await database.close();
    if (writer) await writer.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.end();
  });
  await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`USE \`${databaseName}\``);
  await admin.query(fs.readFileSync(path.join(__dirname, 'fixtures/public-data.sql'), 'utf8'));
  writer = await mysql.createConnection({ ...config, database: databaseName });
  const captured = [], logs = [];
  let scheduleFail = false, observedAt = Date.UTC(2026, 8, 9), stale = false;
  const scheduleSource = async () => {
    if (scheduleFail) throw new Error('private upstream failure');
    return { data: [{ tournamentName: 'External Cup', timestamp: null, team1: { name: 'Known Alias' }, team2: { name: 'TBD' } }], observedAt, stale };
  };
  let cursorTime = Date.UTC(2026, 8, 9);
  const cursors = createCursorCodec({ secret: 'test-secret-with-at-least-32-bytes', now: () => cursorTime });
  const service = createPublicDataService({ database, cursors, getSchedule: scheduleSource });
  const app = express();
  app.use('/data/v1', createDataRouter({ service, requestsPerMinute: 10000, logError: (...args) => logs.push(args) }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/data/v1`;
  const request = async (url, options = {}, expected = 200) => {
    const response = await fetch(base + url, options);
    const text = await response.text(), body = text ? JSON.parse(text) : null;
    assert.equal(response.status, expected, `${options.method || 'GET'} ${url}: ${text}`);
    captured.push({ path: url.split('?')[0], method: (options.method || 'GET').toLowerCase(), status: response.status, headers: Object.fromEntries(response.headers), body });
    return { body, headers: response.headers };
  };

  await t.test('all 21 resources have valid GET and HEAD responses', async () => {
    const paths = ['/competitions', '/competitions/1', '/competitions/1/stages', '/competitions/1/teams',
      '/competitions/1/teams/1/players', '/competitions/1/coverage', '/teams', '/teams/1', '/players', '/players/1',
      '/maps', '/maps/1', '/heroes', '/heroes/1', '/matches', '/matches/1', '/matches/1/games',
      '/matches/1/games/11', '/matches/1/games/11/player-stats', '/matches/1/data', '/schedule'];
    for (const resource of paths) {
      const get = await request(resource);
      const head = await request(resource, { method: 'HEAD' });
      assert.equal(head.body, null);
      assert.equal(head.headers.get('etag'), get.headers.get('etag'));
      assert.equal(head.headers.get('content-length'), get.headers.get('content-length'));
    }
    assert.equal((await request('/competitions/2/coverage')).body.data.matches, 0);
    assert.deepEqual((await request('/matches?competition_id=2')).body.data, []);
    assert.equal((await request('/competitions/2/stages')).body.data.length, 1);
    assert.deepEqual((await request('/matches/4/games')).body.data, []);
  });

  await t.test('SQL filters use the same occurrence and distinguish rosters from appearance', async () => {
    const ids = async query => (await request(`/matches?${query}`)).body.data.map(row => row.id);
    assert.deepEqual(await ids('player_id=1&team_id=1&map_id=2'), [2]);
    assert.deepEqual(await ids('player_id=1&team_id=2'), [3]);
    assert.deepEqual(await ids('player_id=11'), []);
    assert.deepEqual(await ids('map_id=1'), [3, 1]);
    assert.deepEqual(await ids('team_id=1&opponent_id=2'), [3, 2, 1]);
    assert.deepEqual(await ids('competition_id=1&stage_id=1'), [1, 4]);
    assert.deepEqual(await ids('competition_id=1&stage_id=2'), [3, 2]);
    assert.deepEqual(await ids('date_from=2026-09-01&date_to=2026-09-01'), [1]);
    assert.equal((await request('/players?competition_id=1&team_id=1')).body.data.some(row => row.id === 11), true);
    assert.equal((await request('/players?competition_id=1&team_id=1')).body.data.some(row => row.id === 12), false);
    assert.deepEqual((await request('/players?q=shared')).body.data.map(row => row.id), [1, 2]);
    assert.deepEqual((await request('/teams?q=known%20alias')).body.data.map(row => row.id), [1]);
    assert.deepEqual((await request('/teams?q=%25_%20%20club')).body.data.map(row => row.id), [4]);
    assert.deepEqual((await request('/teams?q=%27%20OR%201%3D1%20--')).body.data, []);
    assert.equal((await request('/maps?mode=push')).body.data[0].id, 2);
    assert.equal((await request('/heroes?role=support')).body.data[0].id, 1);
    assert.equal((await request('/matches/1/games/11/player-stats?team_id=1')).body.data.length, 5);
    assert.deepEqual((await request('/matches/1/games/11/player-stats?team_id=2&player_id=1')).body.data, []);
    for (const url of ['/competitions/99/stages', '/competitions/1/teams/3/players', '/matches?competition_id=1&stage_id=3',
      '/matches/1/games/21', '/matches/1/games/11/player-stats?team_id=3', '/players?team_id=99']) await request(url, {}, 404);
  });

  await t.test('keyset pagination survives new first-page inserts and rejects tampered bindings', async () => {
    const first = await request('/matches?limit=1');
    assert.equal(first.body.data[0].id, 3);
    const cursor = encodeURIComponent(first.body.pagination.next_cursor);
    await writer.query("INSERT INTO matches VALUES (999, 1, '2026-09-10', 'BO3', 1, 2, 1, 0, 1)");
    try {
      assert.equal((await request(`/matches?limit=1&cursor=${cursor}`)).body.data[0].id, 2);
      await request(`/matches?limit=2&cursor=${cursor}`, {}, 400);
      await request(`/teams?limit=1&cursor=${cursor}`, {}, 400);
      await request(`/matches?limit=1&cursor=${cursor}x`, {}, 400);
    } finally { await writer.query('DELETE FROM matches WHERE id = 999'); }
    const all = [];
    let next = null;
    do {
      const value = await request(`/matches?limit=2${next ? `&cursor=${encodeURIComponent(next)}` : ''}`);
      all.push(...value.body.data.map(row => row.id)); next = value.body.pagination.next_cursor;
    } while (next);
    assert.deepEqual(all, [3, 2, 1, 4]);
  });

  await t.test('coverage, optional fields and result consistency reflect recorded data', async () => {
    const value = (await request('/matches/1/data')).body.data;
    assert.equal(value.result_consistency, 'consistent');
    assert.equal(value.games.length, 3);
    assert.equal(value.games[0].game.duration_seconds, 599);
    assert.equal(value.games[0].game.number, 1);
    assert.equal(value.games[2].game.number, null);
    assert.equal(value.games[0].player_stats[0].metrics.final_blows, null);
    assert.equal(value.games[0].player_stats[0].hero_stats.items[1].hero.id, null);
    assert.equal(value.games[1].game.winner_team_id, 2);
    assert.equal((await request('/matches/3/data')).body.data.result_consistency, 'conflicting');
    assert.equal((await request('/matches/4/data')).body.data.result_consistency, 'insufficient_data');
    const coverage = (await request('/competitions/1/coverage')).body.data;
    assert.equal(coverage.matches, 4); assert.equal(coverage.games, 5);
    assert.deepEqual(coverage.player_stats, { recorded_games: 1, partial_games: 3, missing_games: 1, recorded_rows: 13 });
    assert.deepEqual(coverage.bans, { total_team_slots: 10, recorded_team_slots: 2 });
    assert.deepEqual(coverage.hero_stats, { games_with_records: 1, player_game_records_with_hero_stats: 1 });
  });

  await t.test('single-match read retains a snapshot while a concurrent writer changes child statistics', async () => {
    let changed = false;
    const hooked = { snapshot: work => database.snapshot(select => work(async (sql, values) => {
      const rows = await select(sql, values);
      if (!changed && sql.startsWith('SELECT g.id')) { changed = true; await writer.query('UPDATE player_stats SET damage = 777 WHERE id = 101'); }
      return rows;
    })) };
    const consistent = createPublicDataService({ database: hooked });
    const before = await request('/matches/1/data');
    try {
      const result = await consistent.gameResource('data', { params: { match_id: 1 }, query: {} });
      assert.equal(result.data.games[0].player_stats[0].metrics.damage, 100);
      const after = await request('/matches/1/data', { headers: { 'If-None-Match': before.headers.get('etag') } });
      assert.equal(after.body.data.games[0].player_stats[0].metrics.damage, 777);
      assert.notEqual(after.headers.get('etag'), before.headers.get('etag'));
      await request('/matches/1/data', { headers: { 'If-None-Match': after.headers.get('etag') } }, 304);
    } finally { await writer.query('UPDATE player_stats SET damage = 100 WHERE id = 101'); }
  });

  await t.test('read-only transaction rejects even a SELECT-triggered routine write', async () => {
    await writer.query(`CREATE FUNCTION attempt_write() RETURNS INT DETERMINISTIC MODIFIES SQL DATA
      BEGIN UPDATE player_stats SET damage = 999 WHERE id = 101; RETURN 1; END`);
    await assert.rejects(database.snapshot(select => select('SELECT attempt_write()')), error => error.code === 'DATA_UNAVAILABLE' && /READ_ONLY_TRANSACTION/.test(error.internalReason));
    assert.equal((await writer.query('SELECT damage FROM player_stats WHERE id = 101'))[0][0].damage, 100);
    await assert.rejects(database.snapshot(select => select('UPDATE player_stats SET damage = 999')), { code: 'DATA_UNAVAILABLE' });
    assert.equal(Number((await database.snapshot(select => select('SELECT COUNT(*) AS count FROM teams')))[0].count), 4);
  });

  await t.test('duplicate player identities and invalid parent identity fail closed, never merge', async () => {
    await writer.query('INSERT INTO player_stats SELECT 998, mapGameId, teamId, playerId, kills, assists, deaths, damage, healing, mitigation FROM player_stats WHERE id = 101');
    try { await request('/matches/1/data', {}, 503); await request('/matches/1/games/11/player-stats', {}, 503); }
    finally { await writer.query('DELETE FROM player_stats WHERE id = 998'); }
    await writer.query('UPDATE map_games SET seasonId = 2 WHERE id = 11');
    try { await request('/matches/1/data', {}, 503); }
    finally { await writer.query('UPDATE map_games SET seasonId = 1 WHERE id = 11'); }
    assert.ok(logs.length >= 3);
  });

  await t.test('schedule freshness and failures are distinguishable from an empty schedule', async () => {
    const fresh = await request('/schedule');
    assert.equal(fresh.body.data[0].competition.id, 1);
    assert.equal(fresh.body.data[0].team1.id, 1);
    assert.equal(fresh.body.data[0].team2, null);
    stale = true;
    const old = await request('/schedule');
    assert.equal(old.body.freshness.observed_at, fresh.body.freshness.observed_at);
    assert.equal(old.body.freshness.stale, true);
    scheduleFail = true;
    await request('/schedule', {}, 503);
    scheduleFail = false; observedAt = Date.UTC(2026, 8, 10); stale = false;
  });

  await t.test('expired cursors use 410 over HTTP', async () => {
    const first = await request('/matches?limit=1');
    cursorTime += 3 * 86400000;
    await request(`/matches?limit=1&cursor=${encodeURIComponent(first.body.pagination.next_cursor)}`, {}, 410);
  });
  if (process.env.DATA_API_HTTP_CAPTURE) fs.writeFileSync(process.env.DATA_API_HTTP_CAPTURE, JSON.stringify(captured, null, 2));
});
