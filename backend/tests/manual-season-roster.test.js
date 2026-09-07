const test = require('node:test');
const assert = require('node:assert/strict');
const sequelize = require('../config/database');
const Season = require('../models/Season');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamAlias = require('../models/TeamAlias');
const membership = require('../services/MembershipSourceService');
const service = require('../services/ManualSeasonRosterService');

const setup = t => {
  const state = { data: {
    teams: [{ id: 1, name: 'WBG', region: '中国' }],
    players: [{ id: 1, name: 'Diya', role: 'damage' }, { id: 2, name: 'Diya', role: 'support' }],
    aliases: [{ teamId: 1, alias: 'Weibo', normalizedAlias: 'weibo' }],
    relations: [], rosters: []
  }, commits: 0, rollbacks: 0, failRoster: false };
  const data = options => options?.transaction?.data || state.data;
  const write = options => { assert.ok(options?.transaction?.data); return data(options); };
  t.mock.method(sequelize, 'transaction', async callback => {
    const tx = { data: structuredClone(state.data), LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } };
    try { const result = await callback(tx); state.data = tx.data; state.commits++; return result; }
    catch (error) { state.rollbacks++; throw error; }
  });
  t.mock.method(Season, 'findByPk', async id => id === 24 ? { id: 24 } : null);
  t.mock.method(Team, 'findByPk', async (id, options) => data(options).teams.find(row => row.id === id));
  t.mock.method(Team, 'findAll', async options => data(options).teams);
  t.mock.method(TeamAlias, 'findAll', async options => data(options).aliases);
  t.mock.method(Player, 'findAll', async options => data(options).players);
  for (const [model, key] of [[Team, 'teams'], [Player, 'players']]) {
    t.mock.method(model, 'create', async (values, options) => {
      const rows = write(options)[key];
      const row = { id: rows.length + 1, ...values };
      rows.push(row);
      return row;
    });
  }
  t.mock.method(membership, 'addManualSeasonTeam', async options => {
    const rows = write(options).relations;
    let row = rows.find(row => row.teamId === options.teamId && row.seasonId === options.seasonId);
    const relationCreated = !row;
    if (!row) { row = { id: rows.length + 1, teamId: options.teamId, seasonId: options.seasonId, sources: [] }; rows.push(row); }
    row.sources = [...new Set([...row.sources, 'manual'])];
    return { seasonTeam: row, relationCreated };
  });
  t.mock.method(membership, 'addManualSeasonTeamPlayer', async options => {
    const rows = write(options).rosters;
    if (state.failRoster) throw new Error('roster write failed');
    let row = rows.find(row => row.seasonTeamId === options.seasonTeam.id && row.playerId === options.playerId);
    const relationCreated = !row;
    if (!row) { row = { id: rows.length + 1, seasonTeamId: options.seasonTeam.id, playerId: options.playerId, sources: [] }; rows.push(row); }
    row.sources = [...new Set([...row.sources, 'manual'])];
    return { relationCreated };
  });
  return state;
};

test('explicit player ID resolves duplicate names and repeated saves preserve all sources', async t => {
  const state = setup(t);
  state.data.relations.push({ id: 1, teamId: 1, seasonId: 24, sources: ['liquipedia'] });
  state.data.rosters.push({ id: 1, seasonTeamId: 1, playerId: 2, sources: ['match'] });
  const body = { team: { id: 1 }, players: [{ id: 2 }] };
  const first = await service.save(24, body);
  assert.equal(first.players[0].id, 2);
  assert.equal(first.players[0].role, 'support');
  assert.equal(first.createdPlayerRelations, 0);
  await service.save(24, body);
  assert.equal(state.data.players.length, 2);
  assert.equal(state.data.rosters.length, 1);
  assert.deepEqual(state.data.rosters[0].sources, ['match', 'manual']);
  assert.deepEqual(state.data.relations[0].sources, ['liquipedia', 'manual']);
});

test('new team and mixed existing/new players are saved in one transaction with manual identity origin', async t => {
  const state = setup(t);
  const result = await service.save(24, {
    team: { new: { name: ' SWE ', region: '欧洲', logo: 'untrusted' } },
    players: [{ id: 1 }, { new: { name: ' Elias ', role: 'tank', externalId: 'must-not-write', identityOrigin: 'match' } }]
  });
  assert.equal(result.createdTeam, true);
  assert.equal(result.createdPlayers, 1);
  assert.equal(result.createdPlayerRelations, 2);
  assert.deepEqual(state.data.teams.at(-1), { id: 2, name: 'SWE', region: '欧洲' });
  assert.deepEqual(state.data.players.at(-1), { id: 3, name: 'Elias', role: 'tank', identityOrigin: 'manual' });
  assert.equal(state.commits, 1);
});

test('new records and memberships roll back together on failure', async t => {
  const state = setup(t);
  const before = structuredClone(state.data);
  state.failRoster = true;
  await assert.rejects(service.save(24, { team: { new: { name: 'SWE', region: '欧洲' } }, players: [{ new: { name: 'Elias', role: 'tank' } }] }), /roster write failed/);
  assert.deepEqual(state.data, before);
  assert.equal(state.rollbacks, 1);
});

test('existing names and team aliases cannot accidentally create duplicate records', async t => {
  const state = setup(t);
  await assert.rejects(service.save(24, { team: { id: 1 }, players: [{ new: { name: ' diya ', role: 'damage' } }] }), { statusCode: 409 });
  await assert.rejects(service.save(24, { team: { new: { name: 'Weibo', region: '中国' } } }), { statusCode: 409 });
  await assert.rejects(service.save(24, { team: { new: { name: 'wbg', region: '中国' } } }), { statusCode: 409 });
  assert.equal(state.commits, 0);
});

test('invalid choices, missing fields and duplicates fail without committing', async t => {
  const state = setup(t);
  for (const body of [
    {}, { team: { id: true } }, { team: { id: 1, new: { name: 'T' } } },
    { team: { new: { name: 'T', region: ' ' } } },
    { team: { id: 1 }, players: [{ new: { name: 'New', role: 'flex' } }] },
    { team: { id: 1 }, players: [{ id: 1 }, { id: 1 }] },
    { team: { id: 1 }, players: [{ new: { name: 'A', role: 'tank' } }, { new: { name: 'a', role: 'damage' } }] },
    { team: { id: 1 }, players: Array.from({ length: 101 }, () => ({ id: 1 })) }
  ]) await assert.rejects(service.save(24, body), { statusCode: 400 });
  await assert.rejects(service.save(24, { team: { id: 99 } }), { statusCode: 409 });
  await assert.rejects(service.save(24, { team: { new: { name: 'T', region: '世界' } }, players: [{ id: 99 }] }), { statusCode: 409 });
  await assert.rejects(service.save(25, { team: { id: 1 } }), { statusCode: 404 });
  assert.equal(state.commits, 0);
});

test('a team-only membership is supported without adding players', async t => {
  const state = setup(t);
  const result = await service.save(24, { team: { id: 1 }, players: [] });
  assert.equal(result.createdTeamRelations, 1);
  assert.equal(result.createdPlayerRelations, 0);
  assert.equal(state.data.rosters.length, 0);
});

test('manual HTTP endpoint returns validation errors and saved entity IDs', async t => {
  setup(t);
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/seasons', require('../routes/seasons'));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/api/seasons/24/manual-roster`;
  const send = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await send({})).status, 400);
  const response = await send({ team: { id: 1 }, players: [{ id: 2 }] });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).players[0].id, 2);
});
