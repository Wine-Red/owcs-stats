const test = require('node:test');
const assert = require('node:assert/strict');
const dto = require('../services/publicData/contract');
const { createCursorCodec } = require('../services/publicData/cursor');
const { parseParameters } = require('../services/publicData/parameters');
const { createCachedResource } = require('../services/CachedResource');

const matchRow = { id: 1, seasonId: 1, competitionName: 'Cup', matchDate: '2026-09-01', boFormat: ' bo5 ',
  team1Id: 1, team1Name: 'A', team2Id: 2, team2Name: 'B', team1Score: 3, team2Score: 2, winnerId: 1 };
const gameRow = { ...matchRow, id: 10, matchId: 1, mapId: 1, mapName: 'Nepal', mapType: '占领要点',
  duration: 9.98333, externalRoundIndex: 0, replayId: 'ABC123', team1Score: 2, team2Score: 0 };
const statRow = { id: 99, mapGameId: 10, playerId: 20, playerName: 'Same', playerRole: 'tank', teamId: 1, teamName: 'A',
  kills: 0, deaths: -1, assists: null, damage: '', healing: 'invalid', mitigation: 5, finalBlows: 9, ultsUsed: 10 };

test('projection normalizes units and preserves unknowns without leaking source fields', () => {
  const parent = dto.match({ ...matchRow, externalId: 'private', updatedAt: 'private' });
  assert.equal(parent.format, 'BO5');
  assert.equal(parent.stage, null);
  assert.equal(parent.externalId, undefined);
  const stat = dto.playerStat(statRow);
  assert.deepEqual(stat.metrics, { eliminations: 0, assists: null, deaths: null, damage: null, healing: null, damage_mitigated: 5, final_blows: null, ultimates_used: null });
  assert.equal(stat.id, undefined);
  assert.deepEqual(stat.hero_stats, { status: 'not_recorded', items: [] });
  const game = dto.game(gameRow, parent, [stat]);
  assert.equal(game.duration_seconds, 599);
  assert.equal(game.number, 1);
  assert.equal(game.team1.banned_hero, null);
  assert.equal(game.player_stats_coverage.status, 'partial');
  assert.equal(dto.game({ ...gameRow, externalRoundIndex: null }, parent, []).number, null);
  for (const value of [0, -1, '', null, undefined, NaN, Infinity, 0.001]) assert.equal(dto.duration(value), null);
});

test('identity corruption fails closed; map score ties retain the independently recorded winner', () => {
  const parent = dto.match(matchRow), stat = dto.playerStat(statRow);
  for (const row of [{ ...gameRow, matchId: 2 }, { ...gameRow, seasonId: 2 }, { ...gameRow, team1Id: 3 }, { ...gameRow, winnerId: 3 }]) {
    assert.throws(() => dto.game(row, parent, [stat]), { code: 'DATA_UNAVAILABLE' });
  }
  assert.throws(() => dto.game(gameRow, parent, [stat, stat]), { code: 'DATA_UNAVAILABLE' });
  assert.throws(() => dto.game(gameRow, parent, [stat, { ...stat, team: { id: 2, name: 'B' } }]), { code: 'DATA_UNAVAILABLE' });
  assert.throws(() => dto.match({ ...matchRow, winnerId: 2 }), { code: 'DATA_UNAVAILABLE' });
  assert.throws(() => dto.match({ ...matchRow, team2Score: 3 }), { code: 'DATA_UNAVAILABLE' });
  assert.equal(dto.game({ ...gameRow, team1Score: 81, team2Score: 81 }, parent, []).winner_team_id, 1);
});

test('coverage requires five players per side, and counts bans separately', () => {
  const parent = dto.match(matchRow);
  const rows = Array.from({ length: 10 }, (_, i) => dto.playerStat({ ...statRow, playerId: i + 1, teamId: i < 5 ? 1 : 2, teamName: i < 5 ? 'A' : 'B' }));
  const complete = dto.game({ ...gameRow, team1BanHeroId: 1, team1BanHeroName: 'Ana' }, parent, rows);
  assert.equal(complete.player_stats_coverage.status, 'recorded');
  const unequal = rows.map((r, i) => i === 5 ? { ...r, team: { id: 1, name: 'A' } } : r);
  assert.equal(dto.game(gameRow, parent, unequal).player_stats_coverage.status, 'partial');
  const missing = dto.game({ ...gameRow, id: 11, duration: 0 }, parent, []);
  const value = dto.coverage(1, null, [parent], [{ game: complete, player_stats: rows }, { game: missing, player_stats: [] }]);
  assert.deepEqual(value.bans, { total_team_slots: 4, recorded_team_slots: 1 });
  assert.deepEqual(value.player_stats, { recorded_games: 1, partial_games: 0, missing_games: 1, recorded_rows: 10 });
  assert.deepEqual(value.duration, { recorded_games: 1, missing_games: 1 });
});

test('series/map consistency flags preserve raw scores and incomplete results', () => {
  const parent = dto.match(matchRow), games = ids => ids.map(winner_team_id => ({ winner_team_id }));
  assert.equal(dto.resultConsistency(parent, games([1, 1, 1, 2, 2])), 'consistent');
  assert.equal(dto.resultConsistency(parent, games([1, 1, 1, 1, 2])), 'conflicting');
  assert.equal(dto.resultConsistency(parent, games([1, 2])), 'insufficient_data');
  assert.equal(dto.resultConsistency(parent, games([1, 1, 1, 2, null])), 'insufficient_data');
  assert.equal(dto.resultConsistency(parent, []), 'insufficient_data');
  assert.equal(parent.team1.score, 3);
});

test('hero items retain partial usage and unknown identity, never certify whole-game optional metrics', () => {
  const row = { playerStatId: 99, heroId: null, heroName: 'Unmapped hero', usageSeconds: 31, usagePercentage: 12,
    finalBlows: 0, deathsByFinalBlow: 2, ultReady: 1, ultUsed: 0, avgUltChargeSeconds: null };
  const stats = dto.playerStat(statRow, [row]);
  assert.equal(stats.hero_stats.status, 'recorded');
  assert.deepEqual(stats.hero_stats.items[0].hero, { id: null, name: 'Unmapped hero' });
  assert.equal(stats.hero_stats.items[0].metrics.usage_percentage, 12);
  assert.equal(stats.hero_stats.items[0].metrics.death_events, 2);
  assert.equal(stats.metrics.final_blows, null);
  assert.throws(() => dto.playerStat(statRow, [row, row]), { code: 'DATA_UNAVAILABLE' });
});

test('cursors are bound to filters, parent resource, page size and expiry', () => {
  let time = Date.UTC(2026, 8, 9);
  const codec = createCursorCodec({ secret: 'test-secret-with-at-least-32-bytes', now: () => time });
  const query = { limit: 2, team_id: 1 }, scope = 'matches';
  const token = codec.encode({ id: 10, date: '2026-09-01' }, scope, query);
  assert.equal(codec.decode(token, scope, query).after.id, 10);
  assert.equal(codec.encode({ id: 10, date: '2026-09-01' }, scope, query), token);
  for (const [t, s, q] of [[`${token}x`, scope, query], [token, 'teams', query], [token, scope, { ...query, limit: 3 }], [token, scope, { ...query, team_id: 2 }]]) {
    assert.throws(() => codec.decode(t, s, q), { code: 'INVALID_ARGUMENT' });
  }
  const previous = codec.decode(token, scope, query);
  time += 86400000;
  assert.equal(codec.decode(codec.encode({ id: 9, date: '2026-09-01' }, scope, query, previous), scope, query).exp, previous.exp);
  time += 86400000;
  assert.throws(() => codec.decode(token, scope, query), { status: 410 });
});

test('parameters reject duplicates, empty strings, invalid dates and contradictory filters', () => {
  const parse = value => parseParameters({ originalUrl: `/matches?${value}`, params: {} }, ['q', 'date_from', 'date_to', 'stage_id', 'team_id', 'opponent_id'], true);
  for (const query of ['limit=1&limit=2', 'limit=', 'limit=101', 'limit=1e2', 'q=%20', 'q[]=A', 'unknown=x', 'date_from=2026-02-30',
    'date_from=2026-09-02&date_to=2026-09-01', 'stage_id=1', 'opponent_id=1', 'team_id=1&opponent_id=1']) {
    assert.throws(() => parse(query), { code: 'INVALID_ARGUMENT' }, query);
  }
  assert.equal(parse('q=%20A%25_%20%20B%20').query.q, 'a%_ b');
});

test('schedule retains ambiguous names and source timestamps; unknown opponents remain null', () => {
  const source = { observedAt: Date.UTC(2026, 8, 9), stale: true, error: 'private upstream error', data: [
    { tournamentName: 'Cup', timestamp: null, sourceId: 'private', team1: { name: 'Known alias' }, team2: { name: 'TBD' } },
    { tournamentName: 'Unknown', timestamp: 1780000000000, team1: { name: 'Shared' }, team2: { name: 'Other' } }
  ] };
  const output = dto.schedule(source, [{ id: 1, name: 'Cup' }], [
    { id: 1, name: 'A', aliases: ['Known alias', 'Shared'] }, { id: 2, name: 'B', aliases: ['Shared'] }
  ]);
  assert.equal(output.freshness.observed_at, '2026-09-09T00:00:00.000Z');
  assert.equal(output.freshness.stale, true);
  assert.equal(output.data[0].team1.id, 1);
  assert.equal(output.data[0].team2, null);
  assert.equal(output.data[0].scheduled_at, null);
  assert.equal(output.data[1].team1.id, null);
  assert.equal(output.data[1].competition.id, null);
  assert.equal(output.error, undefined);
});

test('cached schedule observation does not advance on cache hits or failed refreshes', async t => {
  let time = 1000, fail = false;
  t.mock.method(Date, 'now', () => time);
  const cache = createCachedResource({ ttlMs: 100, loader: async () => { if (fail) throw new Error('offline'); return []; } });
  assert.equal((await cache.get('key')).observedAt, 1000);
  time = 1050;
  assert.equal((await cache.get('key')).observedAt, 1000);
  time = 1200; fail = true;
  const stale = await cache.get('key');
  assert.equal(stale.observedAt, 1000);
  assert.equal(stale.stale, true);
  fail = false; time = 1300;
  assert.equal((await cache.get('key')).observedAt, 1300);
});
