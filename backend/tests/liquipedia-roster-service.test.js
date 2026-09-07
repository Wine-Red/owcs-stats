const test = require('node:test');
const assert = require('node:assert/strict');
const sequelize = require('../config/database');
const Season = require('../models/Season');
const Config = require('../models/Config');
const Team = require('../models/Team');
const Player = require('../models/Player');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const TeamSource = require('../models/SeasonTeamSource');
const PlayerSource = require('../models/SeasonTeamPlayerSource');
const client = require('../services/LiquipediaClient');
const service = require('../services/LiquipediaRosterService');
const controller = require('../controllers/LiquipediaRosterController');

const html = `<h2>Participants</h2><div class="team-participant-card">
<div class="team-participant-card__header"><span class="name"><a href="/overwatch/WBG">WBG</a></span></div>
${['Leave', 'Shy', 'Missing'].map(name => `<div class="team-participant-card__member"><div class="team-participant-card__member-role-left"><img alt="DPS"></div><div class="team-participant-card__member-name"><span class="name"><a href="/overwatch/${name}">${name}</a></span></div></div>`).join('')}</div>`;
let nextSeason = 100;

// Transaction-aware in-memory ORM double: exercises the real membership writer,
// without using the developer's configured database or creating base identities.
const setup = t => {
  const seasonId = nextSeason++;
  const state = {
    store: { teams: [], players: [], teamSources: [], playerSources: [] },
    url: `https://liquipedia.net/overwatch/Test_Event/${seasonId}`,
    catalogPlayers: [{ id: 1, name: 'LEAVE', role: 'damage' }, { id: 2, name: 'Shy', role: 'damage' }],
    requests: 0, commits: 0, rollbacks: 0, failPlayerSource: false, seasonId
  };
  const store = options => options?.transaction?.store || state.store;
  const requireTransaction = options => assert.ok(options?.transaction?.store, 'all membership writes must be transactional');
  t.mock.method(Season, 'findByPk', async id => Number(id) === seasonId ? { id: seasonId, name: 'Test Season' } : null);
  t.mock.method(Config, 'findByPk', async () => ({ value: { liquipediaTournamentUrl: state.url } }));
  t.mock.method(Team, 'findAll', async () => [{ id: 1, name: 'WBG' }]);
  t.mock.method(Player, 'findAll', async () => state.catalogPlayers);
  t.mock.method(Team, 'create', async () => assert.fail('must not create teams'));
  t.mock.method(Player, 'create', async () => assert.fail('must not create players'));
  t.mock.method(SeasonTeam, 'findAll', async options => store(options).teams);
  t.mock.method(SeasonTeamPlayer, 'findAll', async options => store(options).players);
  t.mock.method(client, 'fetchParsedHtml', async () => { state.requests++; return { html, revisionId: 123 }; });
  t.mock.method(sequelize, 'transaction', async callback => {
    const transaction = { store: structuredClone(state.store), LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } };
    try {
      const result = await callback(transaction);
      state.store = transaction.store;
      state.commits++;
      return result;
    } catch (error) { state.rollbacks++; throw error; }
  });
  for (const [model, key] of [[SeasonTeam, 'teams'], [SeasonTeamPlayer, 'players']]) {
    t.mock.method(model, 'findOrCreate', async options => {
      requireTransaction(options);
      const rows = store(options)[key];
      const existing = rows.find(row => Object.entries(options.where).every(([field, value]) => row[field] === value));
      if (existing) return [existing, false];
      const row = { id: rows.length + 1, ...options.defaults };
      rows.push(row);
      return [row, true];
    });
  }
  for (const [model, key] of [[TeamSource, 'teamSources'], [PlayerSource, 'playerSources']]) {
    t.mock.method(model, 'findOne', async options => {
      const row = store(options)[key].find(row => Object.entries(options.where).every(([field, value]) => row[field] === value));
      return row ? { ...row, update: async (values, options) => { requireTransaction(options); Object.assign(row, values); } } : null;
    });
    t.mock.method(model, 'create', async (values, options) => {
      requireTransaction(options);
      if (state.failPlayerSource && key === 'playerSources') throw new Error('simulated source write failure');
      const row = { id: store(options)[key].length + 1, ...values };
      store(options)[key].push(row);
      return row;
    });
  }
  return state;
};

test('preview is read-only, cached, and exposes missing names', async t => {
  const state = setup(t);
  const report = await service.preview(state.seasonId);
  assert.equal(report.summary.matchedTeams, 1);
  assert.equal(report.summary.matchedPlayers, 2);
  assert.equal(report.summary.skippedPlayers, 1);
  assert.equal(state.store.teams.length, 0);
  assert.equal(state.commits, 0);
  await service.preview(state.seasonId);
  assert.equal(state.requests, 1);
});

test('excluding an entire team writes no team or player evidence and preserves existing relations', async t => {
  const state = setup(t);
  state.store.teams.push({ id: 1, seasonId: state.seasonId, teamId: 1 });
  state.store.players.push({ id: 1, seasonTeamId: 1, playerId: 2 });
  state.store.teamSources.push({ seasonTeamId: 1, sourceType: 'manual', sourceKey: 'admin', active: true });
  const before = structuredClone(state.store);
  const report = await service.preview(state.seasonId);
  const result = await service.apply(state.seasonId, report.previewToken, [report.teams[0].link]);
  assert.equal(result.excludedTeams, 1);
  assert.equal(result.summary.totalTeams, 0);
  assert.equal(result.summary.totalPlayers, 0);
  assert.equal(result.createdPlayers, 0);
  assert.equal(result.addedTeamSources, 0);
  assert.equal(result.addedPlayerSources, 0);
  assert.deepEqual(state.store, before);
});

test('exclusions must be a list of team links from the server preview', async t => {
  const state = setup(t);
  const report = await service.preview(state.seasonId);
  for (const exclusions of [null, 'WBG', [1], ['https://liquipedia.net/overwatch/Unrelated']]) {
    await assert.rejects(service.apply(state.seasonId, report.previewToken, exclusions), { statusCode: 400 });
  }
  assert.equal(state.commits, 0);
});

test('apply is additive and repeatable, preserving manual and match evidence', async t => {
  const state = setup(t);
  state.store.teams.push({ id: 1, seasonId: state.seasonId, teamId: 1 });
  state.store.players.push({ id: 1, seasonTeamId: 1, playerId: 2 });
  state.store.teamSources.push({ seasonTeamId: 1, sourceType: 'manual', sourceKey: 'admin', active: true });
  state.store.playerSources.push({ seasonTeamPlayerId: 1, sourceType: 'match', sourceKey: 'match-1', active: true });
  const report = await service.preview(state.seasonId);
  const first = await service.apply(state.seasonId, report.previewToken);
  assert.equal(first.createdTeams, 0);
  assert.equal(first.createdPlayers, 1);
  assert.equal(first.addedTeamSources, 1);
  assert.equal(first.addedPlayerSources, 2);
  const second = await service.apply(state.seasonId, report.previewToken);
  assert.equal(second.createdTeams, 0);
  assert.equal(second.createdPlayers, 0);
  assert.equal(second.addedPlayerSources, 0);
  assert.equal(state.store.teamSources[0].sourceType, 'manual');
  assert.equal(state.store.teamSources[0].active, true);
  assert.equal(state.store.playerSources[0].sourceType, 'match');
  assert.equal(state.store.playerSources[0].active, true);
  assert.equal(state.store.players.length, 2);
  assert.equal(state.requests, 1);
});

test('failure in evidence insertion rolls back all membership changes', async t => {
  const state = setup(t);
  const report = await service.preview(state.seasonId);
  const before = structuredClone(state.store);
  state.failPlayerSource = true;
  await assert.rejects(service.apply(state.seasonId, report.previewToken), /simulated source write failure/);
  assert.deepEqual(state.store, before);
  assert.equal(state.rollbacks, 1);
  assert.equal(state.commits, 0);
});

test('changed configuration or identity decisions reject stale previews before writing', async t => {
  const state = setup(t);
  const report = await service.preview(state.seasonId);
  const url = state.url;
  state.url += '/Another';
  await assert.rejects(service.apply(state.seasonId, report.previewToken), { statusCode: 409 });
  state.url = url;
  state.catalogPlayers.push({ id: 3, name: 'Leave' });
  await assert.rejects(service.apply(state.seasonId, report.previewToken), { statusCode: 409 });
  assert.equal(state.store.teams.length, 0);
});

test('new cross-team membership after preview requires another preview', async t => {
  const state = setup(t);
  const report = await service.preview(state.seasonId);
  state.store.teams.push({ id: 10, teamId: 99, seasonId: state.seasonId });
  state.store.players.push({ id: 10, seasonTeamId: 10, playerId: 1 });
  await assert.rejects(service.apply(state.seasonId, report.previewToken), { statusCode: 409 });
  assert.equal(state.store.teams.length, 1);
});

test('invalid, wrong-season and expired tokens cannot write', async t => {
  const state = setup(t);
  const report = await service.preview(state.seasonId);
  await assert.rejects(service.apply(state.seasonId, 'client-invented'), { statusCode: 409 });
  await assert.rejects(service.apply(state.seasonId + 1, report.previewToken), { statusCode: 409 });
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 16 * 60 * 1000);
  await assert.rejects(service.apply(state.seasonId, report.previewToken), { statusCode: 409 });
  assert.equal(state.commits, 0);
});

test('unavailable upstream, invalid source and unsupported markup cannot produce an applicable preview', async t => {
  const state = setup(t);
  state.url = '';
  await assert.rejects(service.preview(state.seasonId), { statusCode: 400 });
  state.url = `https://liquipedia.net/overwatch/Unavailable/${state.seasonId}`;
  t.mock.method(client, 'fetchParsedHtml', async () => { throw new Error('403'); });
  await assert.rejects(service.preview(state.seasonId), { statusCode: 502 });
  t.mock.method(client, 'fetchParsedHtml', async () => ({ html: '<h2>Unknown</h2>' }));
  await assert.rejects(service.preview(state.seasonId), { statusCode: 422 });
  assert.equal(state.commits, 0);
});

test('controller validates IDs and only accepts a preview token, never client match IDs', async t => {
  const state = setup(t);
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.preview({ params: { id: '-1' } }, res);
  assert.equal(res.code, 400);
  await controller.apply({ params: { id: String(state.seasonId) }, body: { teamId: 1, playerIds: [1] } }, res);
  assert.equal(res.code, 409);
  assert.equal(state.commits, 0);
});

test('individual player exclusions are validated and omit only that player', async t => {
  const state = setup(t);
  const report = await service.preview(state.seasonId);
  const team = report.teams.find(row => row.status === 'matched');
  const player = team.players.find(row => row.status === 'matched');
  const key = JSON.stringify([team.link, player.link, player.name]);
  await assert.rejects(service.apply(state.seasonId, report.previewToken, [], ['invented']), { statusCode: 400 });
  const result = await service.apply(state.seasonId, report.previewToken, [], [key]);
  assert.equal(result.createdTeams, 1);
  assert.equal(result.createdPlayers, 1);
  assert.equal(state.store.players.some(row => row.playerId === player.playerId), false);
});

test('HTTP preview and apply routes use the real controller and membership service', async t => {
  const state = setup(t);
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/seasons', require('../routes/seasons'));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api/seasons/${state.seasonId}/liquipedia-roster`;
  const previewResponse = await fetch(`${base}/preview`, { method: 'POST' });
  assert.equal(previewResponse.status, 200);
  const report = await previewResponse.json();
  assert.equal(state.commits, 0);
  const applyResponse = await fetch(`${base}/apply`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ previewToken: report.previewToken })
  });
  assert.equal(applyResponse.status, 200);
  const result = await applyResponse.json();
  assert.equal(result.createdTeams, 1);
  assert.equal(result.createdPlayers, 2);
  assert.equal(result.summary.skippedPlayers, 1);
  assert.equal(state.store.teams.length, 1);
  assert.equal(state.store.players.length, 2);
});
