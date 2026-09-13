import test from 'node:test';
import assert from 'node:assert/strict';
import { projectTimeline } from '../server/timeline.js';
import { createDataClient } from '../server/data.js';
import { createTools } from '../server/tools.js';

const game = { id: 11, match_id: 1, number: 1, map: { id: 20, name: '尼泊尔' },
  team1: { team: { id: 64, name: 'SAU' } }, team2: { team: { id: 58, name: 'ESP' } } };
const stats = [
  { player: { id: 81, name: 'Quartz', role: 'damage' }, team: game.team1.team },
  { player: { id: 82, name: 'KHENAIL', role: 'support' }, team: game.team2.team },
];
const event = (type, timeMs, extra = {}) => ({ type, timeMs, roundId: 'r1', status: 'confirmed', confidence: 0.7, ...extra });
function fixture() {
  return { id: 11, matchId: 1, mapId: 20, team1Id: 64, team2Id: 58, createdAt: 'private-audit-field',
    timeline: { revision: 3, sourceTaskId: 'private-task', payload: {
      schemaVersion: 2, timebase: { kind: 'round-local', nonGameplay: 'excluded', segmentJoin: 'seamless' },
      media: { durationMs: 70000, path: 'C:/private-video.mp4' }, source: { taskId: 'private-task' }, evidence: [{ path: 'private-image' }],
      rounds: [{ roundId: 'r1', index: 1, startMs: 0, endMs: 30000, durationMs: 30000 },
        { roundId: 'r2', index: 2, startMs: 0, endMs: 40000, durationMs: 40000 }],
      players: [{ playerId: 'QUARTZ', displayName: 'QUARTZ', teamSide: 'A' },
        { playerId: 'KHENAIL', displayName: 'KHENAIL', teamSide: 'B' }],
      phases: [{ roundId: 'r1', kind: 'gameplay', startMs: 0, endMs: 30000, reason: 'private-review-note' }],
      events: [
        event('hero_selected', 0, { playerId: 'QUARTZ', heroName: '猎空' }),
        event('hero_switch', 1500, { playerId: 'QUARTZ', heroName: '艾什', previousHeroName: '猎空' }),
        event('kill', 11000, { killerId: 'QUARTZ', victimId: 'KHENAIL', evidenceIds: ['private-evidence'] }),
        event('death', 11000, { playerId: 'KHENAIL' }),
        event('ultimate_ready', 19000, { playerId: 'QUARTZ' }),
        event('ultimate_used', 24000, { playerId: 'QUARTZ' }),
        event('kill', 5000, { roundId: 'r2', killerId: 'KHENAIL', victimId: 'QUARTZ' }),
        event('kill', 6000, { roundId: 'r2', killerId: 'QUARTZ', victimId: 'KHENAIL', status: 'candidate' }),
        event('kill', 7000, { roundId: 'r2', killerId: 'QUARTZ', victimId: 'KHENAIL', status: 'rejected' }),
      ],
    } } };
}

test('timeline preserves round-local ordering, raw event meanings and full counts across pagination', () => {
  const raw = fixture();
  const first = projectTimeline(raw, game, stats, { limit: 3 });
  assert.equal(first.availability, 'recorded');
  assert.equal(first.timebase, 'round_local_seconds');
  assert.equal(first.matching_event_counts.kill, 2);
  assert.equal(first.matching_event_counts.death, 1, 'kill victims must not be added to death markers');
  assert.equal(first.matching_event_counts.ultimate_ready, 1);
  assert.equal(first.matching_event_counts.ultimate_used, 1);
  assert.equal(first.pagination.matching_events, 7);
  assert.equal(first.pagination.has_more, true);
  assert.equal(first.events[2].killer, 'Quartz');
  assert.equal(first.events[2].confidence, 0.7, 'confirmed low confidence is preserved');
  assert.equal(first.players[0].team, 'SAU');
  const second = projectTimeline(raw, game, stats, { offset: first.pagination.next_offset, snapshot: first.pagination.snapshot, limit: 4 });
  assert.equal(second.pagination.has_more, false);
  assert.deepEqual(second.events.at(-1), { round: 2, time_seconds: 5, type: 'kill', killer: 'KHENAIL', killer_team: 'ESP', victim: 'Quartz', victim_team: 'SAU', status: 'confirmed', confidence: 0.7 });
  assert.equal(first.rounds[1].matching_event_counts.kill, 1);
  assert.doesNotMatch(JSON.stringify(first), /private-|evidenceIds|sourceTaskId|createdAt|reason/);
});

test('timeline selectors retain uncertainty, distinguish no matching event, and do not sum duplicate observations', () => {
  const raw = fixture();
  const selected = projectTimeline(raw, game, stats, { round_number: 2, player: 'quartz', event_types: ['kill'], include_unconfirmed: true });
  assert.equal(selected.events.length, 2);
  assert.equal(selected.events[0].victim, 'Quartz', 'selection includes the victim');
  assert.equal(selected.events[1].status, 'candidate');
  assert.equal(selected.coverage.rejected_events, 1);
  assert.equal(selected.coverage.unconfirmed_events, 1);
  const empty = projectTimeline(raw, game, stats, { round_number: 2, event_types: ['ultimate_used'] });
  assert.equal(empty.availability, 'recorded');
  assert.equal(empty.pagination.matching_events, 0);
  assert.throws(() => projectTimeline(raw, game, stats, { player: 'unknown' }), /无法唯一匹配/);
  const span = projectTimeline(raw, game, stats, { round_number: 1, start_seconds: 18, end_seconds: 25 });
  assert.deepEqual(span.events.map(e => e.type), ['ultimate_ready', 'ultimate_used']);
});

test('timeline refuses cross-map data, ambiguous time windows, broken rounds and changed pagination snapshots', () => {
  const raw = fixture();
  for (const field of ['id', 'matchId', 'mapId', 'team1Id', 'team2Id'])
    assert.throws(() => projectTimeline({ ...raw, [field]: 999 }, game, stats, {}), /不一致/);
  assert.throws(() => projectTimeline(raw, game, stats, { start_seconds: 3 }), /多个回合/);
  assert.throws(() => projectTimeline(raw, game, stats, { round_number: 9 }), /没有所选回合/);
  assert.throws(() => projectTimeline(raw, game, stats, { round_number: 1, start_seconds: 5, end_seconds: 4 }), /不能晚于/);
  const first = projectTimeline(raw, game, stats, { limit: 1 });
  assert.throws(() => projectTimeline(raw, game, stats, { offset: 1 }), /分页缺少快照/);
  const changed = fixture(); changed.timeline.payload.events[2].timeMs = 12000;
  assert.throws(() => projectTimeline(changed, game, stats, { offset: 1, snapshot: first.pagination.snapshot }), /数据已更新/);
  assert.throws(() => projectTimeline({ ...raw, timeline: null }, game, stats, { offset: 1, snapshot: first.pagination.snapshot }), /已移除/);
  const broken = fixture(); broken.timeline.payload.events[2].roundId = 'missing';
  assert.throws(() => projectTimeline(broken, game, stats, {}), /不存在的回合/);
  const outOfRound = fixture(); outOfRound.timeline.payload.events[2].timeMs = 35000;
  assert.throws(() => projectTimeline(outOfRound, game, stats, {}), /超出了所属回合/);
});

test('same-name timeline players are kept separate by identity and team', () => {
  const raw = fixture();
  raw.timeline.payload.players.forEach(p => { p.displayName = 'Same'; });
  assert.throws(() => projectTimeline(raw, game, [], { player: 'Same' }), /无法唯一匹配/);
  const selected = projectTimeline(raw, game, [], { player: 'QUARTZ', event_types: ['death'] });
  assert.equal(selected.events.length, 0, 'the other Same player death cannot enter this player filter');
  const all = projectTimeline(raw, game, [], { event_types: ['kill'] });
  assert.equal(all.events[0].killer, all.events[0].victim);
  assert.equal(all.events[0].killer_team, 'SAU');
  assert.equal(all.events[0].victim_team, 'ESP');
});

test('timeline distinguishes absent data from invalid data and keeps legacy media timestamps', () => {
  const raw = fixture();
  assert.equal(projectTimeline({ ...raw, timeline: null }, game, stats, {}).availability, 'not_recorded');
  const missing = { ...raw }; delete missing.timeline;
  assert.throws(() => projectTimeline(missing, game, stats, {}));
  const unknown = fixture(); unknown.timeline.payload.timebase.kind = 'unknown';
  assert.throws(() => projectTimeline(unknown, game, stats, {}), /时间基准/);
  const legacy = fixture(); legacy.timeline.payload.schemaVersion = 1;
  delete legacy.timeline.payload.timebase; legacy.timeline.payload.rounds = [];
  const result = projectTimeline(legacy, game, stats, {});
  assert.equal(result.timebase, 'media_seconds'); assert.equal(result.events[0].round, null);
});

test('display adapter uses fixed read-only paths, validates responses, strips internals and shares cancellation/cache behavior', async () => {
  const calls = [];
  const client = createDataClient({ baseUrl: 'https://stats.test/data/v1', interval: 0, fetcher: async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(fixture());
  } });
  const result = await client.getTimeline(11);
  assert.equal(calls[0].url, 'https://stats.test/public-api/map-games/11');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.doesNotMatch(JSON.stringify(result.body), /private-/);
  await client.getTimeline(11); assert.equal(calls.length, 1);
  await assert.rejects(client.getTimeline('../settings'), /编号无效/);
  await assert.rejects(client.get('/public-api/map-games/11'), /仅支持/);
  await assert.rejects(client.getTimeline(11, AbortSignal.abort()), /abort/i);
  assert.equal(calls.length, 1);
  for (const response of [new Response('login', { headers: { 'content-type': 'text/html' } }), Response.json({}), new Response('', { status: 404 })]) {
    const bad = createDataClient({ baseUrl: 'https://stats.test/data/v1', fetcher: async () => response, interval: 0 });
    await assert.rejects(bad.getTimeline(11), e => ['INVALID_RESPONSE', 'CONTRACT_MISMATCH', 'NOT_FOUND'].includes(e.code));
  }
});

test('timeline tool resolves the current map and rejects foreign map IDs before fetching display data', async () => {
  const calls = [];
  const client = { async get(path) {
    calls.push(path); return { body: { data: { match: { id: 1 }, games: [{ game, player_stats: stats }] } }, url: 'https://stats.test/data/v1' + path };
  }, async getTimeline(id) { calls.push(`timeline:${id}`); return { body: fixture(), url: `https://stats.test/public-api/map-games/${id}` }; } };
  const { tools } = createTools({ client, page: { match_id: 1, game_id: 11 } });
  const result = await tools.read_timeline.execute({});
  assert.equal(result.scope.game_id, 11); assert.equal(result.events.length, 7);
  const mismatch = await tools.read_timeline.execute({ match_id: 1, game_id: 999 });
  assert.ok(mismatch.error); assert.equal(calls.filter(x => x.startsWith('timeline:')).length, 1);
});
