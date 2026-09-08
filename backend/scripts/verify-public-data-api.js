// Read-only replay against the configured database. No app startup or migrations.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const express = require('express');
const { createPublicDataService } = require('../services/publicData/service');
const { createDataRouter } = require('../routes/data-v1');

const main = async () => {
  const service = createPublicDataService();
  const app = express();
  app.use('/data/v1', createDataRouter({ service, requestsPerMinute: 100000 }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/data/v1`;
  const captures = [];
  const request = async (resource, method = 'GET') => {
    const response = await fetch(base + resource, { method, signal: AbortSignal.timeout(120000) });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    assert.equal(response.status, 200, `${resource}: ${text}`);
    captures.push({ path: resource.split('?')[0], method: method.toLowerCase(), status: response.status, headers: Object.fromEntries(response.headers), body });
    return body;
  };
  const getAll = async resource => {
    const rows = [];
    let cursor;
    do {
      const value = await request(`${resource}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      rows.push(...value.data); cursor = value.pagination.next_cursor;
    } while (cursor);
    return rows;
  };
  try {
    const identity = await service.database.snapshot(select => select('SELECT VERSION() AS version, DATABASE() AS database_name, CURRENT_USER() AS db_user'));
    const counts = await service.database.snapshot(select => select(`SELECT
      (SELECT COUNT(*) FROM matches) AS matches, (SELECT COUNT(*) FROM map_games WHERE matchId IS NOT NULL) AS games,
      (SELECT COUNT(*) FROM player_stats ps JOIN map_games g ON g.id = ps.mapGameId WHERE g.matchId IS NOT NULL) AS player_rows,
      (SELECT SUM(ps.damage) FROM player_stats ps JOIN map_games g ON g.id = ps.mapGameId WHERE g.matchId IS NOT NULL) AS damage`));
    const catalogs = {};
    for (const resource of ['competitions', 'teams', 'players', 'maps', 'heroes']) {
      catalogs[resource] = await getAll(`/${resource}`);
      await request(`/${resource}`, 'HEAD');
      if (catalogs[resource].length) {
        await request(`/${resource}/${catalogs[resource][0].id}`);
        await request(`/${resource}/${catalogs[resource][0].id}`, 'HEAD');
      }
    }
    const matches = await getAll('/matches');
    assert.equal(matches.length, Number(counts[0].matches));
    await request('/matches', 'HEAD');
    const consistency = { consistent: 0, conflicting: 0, insufficient_data: 0 };
    let games = 0, rows = 0, damage = 0, childExample;
    const replay = process.argv.includes('--all-matches') ? matches : matches.slice(0, 1);
    const started = Date.now();
    for (const match of replay) {
      const bundle = (await request(`/matches/${match.id}/data`)).data;
      consistency[bundle.result_consistency]++;
      games += bundle.games.length;
      for (const entry of bundle.games) {
        rows += entry.player_stats.length;
        damage += entry.player_stats.reduce((sum, p) => sum + (p.metrics.damage ?? 0), 0);
        childExample ||= { matchId: match.id, gameId: entry.game.id };
      }
    }
    if (process.argv.includes('--all-matches')) {
      assert.equal(games, Number(counts[0].games)); assert.equal(rows, Number(counts[0].player_rows));
      assert.equal(damage, Number(counts[0].damage));
    }
    if (matches.length) {
      const matchId = matches[0].id;
      await request(`/matches/${matchId}`); await request(`/matches/${matchId}`, 'HEAD');
      await request(`/matches/${matchId}/data`, 'HEAD');
      await request(`/matches/${matchId}/games`); await request(`/matches/${matchId}/games`, 'HEAD');
    }
    if (childExample) {
      const resource = `/matches/${childExample.matchId}/games/${childExample.gameId}`;
      for (const suffix of ['', '/player-stats']) { await request(resource + suffix); await request(resource + suffix, 'HEAD'); }
    }
    const coverage = [];
    let rosterChecked = false;
    for (const competition of catalogs.competitions) {
      const root = `/competitions/${competition.id}`;
      coverage.push((await request(`${root}/coverage`)).data);
      await request(`${root}/coverage`, 'HEAD'); await request(`${root}/stages`); await request(`${root}/stages`, 'HEAD');
      const teams = (await request(`${root}/teams`)).data; await request(`${root}/teams`, 'HEAD');
      if (!rosterChecked && teams.length) {
        const roster = `${root}/teams/${teams[0].id}/players`;
        await request(roster); await request(roster, 'HEAD'); rosterChecked = true;
      }
    }
    let schedule = 'not requested';
    if (process.argv.includes('--schedule')) {
      const value = await request('/schedule'); await request('/schedule', 'HEAD');
      schedule = { items: value.data.length, ...value.freshness };
    }
    const captureIndex = process.argv.indexOf('--capture');
    if (captureIndex !== -1) fs.writeFileSync(process.argv[captureIndex + 1], JSON.stringify(captures));
    console.log(JSON.stringify({ identity: identity[0], catalog_counts: Object.fromEntries(Object.entries(catalogs).map(([key, value]) => [key, value.length])),
      replay: { matches: replay.length, games, player_rows: rows, damage, result_consistency: consistency, elapsed_ms: Date.now() - started },
      competition_coverage: coverage.length, http_responses: captures.length, schedule, result: 'passed', scope: 'local read-only replay; not a production deployment' }, null, 2));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await service.database.close();
  }
};
main().catch(error => { console.error(error.message); process.exitCode = 1; });
