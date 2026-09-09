import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readStaticData } from '../../src/services/staticSnapshot.mjs';
import { validateSnapshot, writeResources, verifyResources, mediaSources, replaceMedia } from '../lib/static-package.mjs';

const fixture = () => ({
  schemaVersion: 2, generatedAt: '2026-09-10T00:00:00Z',
  counts: { seasons: 1, teams: 2, matches: 2107, mapGames: 2107 },
  schedule: { data: [], stale: false, observedAt: Date.now() },
  collections: {
    seasons: [{ id: 1 }], teams: [{ id: 1 }, { id: 2 }], players: [{ id: 7 }], maps: [{ id: 9 }], heroes: [],
    seasonTeams: [{ id: 8, seasonId: 1, teamId: 2 }], seasonTeamPlayers: [{ id: 1, seasonTeamId: 8, playerId: 7 }],
    playerStats: [{ id: 1, mapGameId: 2107, playerId: 7, finalBlows: null, kills: 0 }],
    matches: Array.from({ length: 2107 }, (_, i) => ({ id: i + 1, seasonId: 1, team1Id: i % 2 ? 2 : 1, team2Id: 3, matchDate: '2026-09-09' })),
    mapGames: Array.from({ length: 2107 }, (_, i) => ({ id: i + 1, matchId: i + 1, seasonId: 1, mapId: i % 2 ? 9 : 10, timeline: i === 2106 ? { revision: 1 } : null }))
  },
  views: { seasonStats: { 1: { teamScore: [{ teamId: 2 }], stageStats: { 5: { teamScore: [{ teamId: 1 }], players: [{ playerId: 7 }], mapPicks: [{ mapId: 9 }] } } } } },
  timelines: { 2107: { revision: 1, payload: { events: [{ type: 'kill', at: 2000 }], rounds: [{ durationMs: 5000 }] } } }
});
const reader = snapshot => (name) => name.split('.').reduce((value, key) => value?.[key], snapshot);

test('complete collections support previously uncaptured pages, page sizes and intersecting filters', async () => {
  const read = (url, params) => readStaticData(reader(fixture()), url, params);
  const last = await read('/matches', { page: 302, pageSize: 7 });
  assert.equal(last.total, 2107);
  assert.deepEqual(last.list.map(row => row.id), []);
  assert.deepEqual((await read('/matches', { page: 301, pageSize: 7 })).list.map(row => row.id), [2101, 2102, 2103, 2104, 2105, 2106, 2107]);
  const filtered = await read('/matches?mapId=9&pageSize=3000', { teamId: 2, seasonId: 1, startDate: '2026-09-09', endDate: '2026-09-09' });
  assert.equal(filtered.total, 1053);
  assert.ok(filtered.list.every(row => row.id % 2 === 0));
  assert.equal((await read('/map-games', { pageSize: 3000 })).length, 2107);
  assert.equal((await read('/matches/2107/map-games'))[0].id, 2107);
});

test('timeline bodies load only on map detail; zero and unknown remain distinct', async () => {
  const snapshot = fixture(), loaded = [];
  const load = name => { loaded.push(name); return reader(snapshot)(name); };
  await readStaticData(load, '/matches/2107/map-games');
  assert.ok(!loaded.some(name => name.startsWith('timelines.')));
  const game = await readStaticData(load, '/map-games/2107');
  assert.deepEqual(game.timeline.payload, snapshot.timelines[2107].payload);
  const rows = await readStaticData(load, '/map-games/2107/player-stats');
  assert.equal(rows[0].kills, 0);
  assert.equal(rows[0].finalBlows, null);
});

test('invalid parameters, missing identities and unsupported requests fail visibly', async () => {
  const load = reader(fixture());
  for (const [url, status] of [['/matches?pageSize=0', 400], ['/matches?unexpected=1', 400], ['/matches/99999', 404], ['https://remote.test/matches', 400], ['/poll-api/vote', 404]]) {
    await assert.rejects(readStaticData(load, url), error => error.response.status === status);
  }
  assert.deepEqual(await readStaticData(load, '/season-stats/1/team-score?stageId=5'), [{ teamId: 1 }]);
  assert.deepEqual(await readStaticData(load, '/season-stats/1?stageId=5'), [{ playerId: 7 }]);
  assert.deepEqual(await readStaticData(load, '/season-stats/1/map-picks?stageId=5'), [{ mapId: 9 }]);
  assert.equal((await readStaticData(load, '/seasons/1/teams'))[0].id, 2);
  assert.equal((await readStaticData(load, '/season-teams/8/players'))[0].playerId, 7);
});

test('snapshot validation rejects truncated data, stale schedule and missing timeline payload', () => {
  validateSnapshot(fixture());
  for (const corrupt of [s => s.collections.matches.pop(), s => { s.schedule.stale = true; }, s => { delete s.timelines[2107]; }]) {
    const value = fixture(); corrupt(value); assert.throws(() => validateSnapshot(value));
  }
});

test('resource files round trip without truncation and detect a corrupted deployment', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'owcs-static-test-'));
  try {
    const snapshot = fixture(), files = await writeResources(directory, snapshot);
    const manifest = { schemaVersion: 2, files };
    await verifyResources(directory, manifest);
    const load = async name => JSON.parse(await readFile(path.join(directory, files[name].path), 'utf8'));
    assert.equal((await readStaticData(load, '/matches', { pageSize: 3000 })).total, 2107);
    await writeFile(path.join(directory, files['collections.matches'].path), '[]');
    await assert.rejects(verifyResources(directory, manifest), /校验失败/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('media discovery covers nested config and roster assets but preserves outbound page links', () => {
  const value = { logo: '/media/team.png', config: { backgroundImage: 'https://cdn.test/bg.jpg' }, rows: [{ image: '/heroes/a.png' }], link: 'https://liquipedia.net/overwatch' };
  assert.equal(mediaSources(value).length, 3);
  assert.equal(replaceMedia(value, new Map([['/media/team.png', 'local.png']])).logo, 'local.png');
  assert.equal(replaceMedia(value, new Map()).link, value.link);
});

test('an invalid export preserves the previous usable package', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'owcs-export-failure-'));
  try {
    await mkdir(path.join(directory, 'public/static-data'), { recursive: true });
    await writeFile(path.join(directory, 'public/static-data/manifest.json'), 'previous-valid-release');
    await writeFile(path.join(directory, 'static-export.config.json'), JSON.stringify({ productionApiBase: 'https://example.test/api' }));
    await writeFile(path.join(directory, 'broken.json'), JSON.stringify({ schemaVersion: 1 }));
    assert.throws(() => execFileSync(process.execPath, [path.resolve('scripts/export-static.mjs')], {
      cwd: directory, env: { ...process.env, OWCS_STATIC_SNAPSHOT_FILE: 'broken.json' }, stdio: 'pipe'
    }));
    assert.equal(await readFile(path.join(directory, 'public/static-data/manifest.json'), 'utf8'), 'previous-valid-release');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
