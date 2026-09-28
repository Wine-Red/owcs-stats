import test from 'node:test';
import assert from 'node:assert/strict';
import { tournamentMatchNavigation, attachTournamentNavigation, collectTournamentPreviews } from './tournamentMatchNavigation.mjs';
import { attachStageResults } from './tournamentResults.mjs';

const now = Date.parse('2026-09-28T12:00:00Z');
const match = { timestamp: Date.parse('2026-10-02T08:00:00Z'), opponents: [
  { teamId: 25, name: 'Cheeseburger', localName: 'CB', score: null },
  { teamId: 27, name: 'Poker Face', localName: 'PF', score: null }
] };
const options = { seasonId: 28, tournament: '2026 OWCS 韩国赛区第三阶段', stageId: 'regular-season', now };

test('a future confirmed pairing links directly to preview with IDs, calendar date, time and return stage', () => {
  const nav = tournamentMatchNavigation(match, options);
  assert.equal(nav.preview, true);
  assert.equal(nav.date, '10.02');
  assert.equal(nav.time, '16:00');
  assert.equal(nav.to.path, '/visualize/upcoming-match');
  assert.deepEqual(nav.to.query, { seasonId: 28, team1Id: 25, team2Id: 27, t1: 'CB', t2: 'PF', time: match.timestamp,
    tournament: options.tournament, from: 'tournament', returnSeasonId: 28, tournamentStage: 'regular-season' });
});

test('TBD, missing or duplicate identities, unknown dates and source conflicts cannot create preview links', () => {
  for (const input of [
    { ...match, timestamp: null }, { ...match, timestamp: now - 1 },
    { ...match, opponents: [{ name: 'TBD' }, match.opponents[1]] },
    { ...match, opponents: [match.opponents[0], match.opponents[0]] },
    { ...match, sourceConflict: true },
    { ...match, opponents: match.opponents.map(team => ({ ...team, score: 'W' })) }
  ]) assert.equal(tournamentMatchNavigation(input, options).to, null);
  assert.equal(tournamentMatchNavigation(match, { ...options, blocked: true }).to, null);
  assert.equal(tournamentMatchNavigation({ ...match, timestamp: null }, options).date, '日期待定');
});

test('recorded results keep their actual match season; an empty future fixture can still open preview', () => {
  const recorded = { ...match, matchId: 900, matchSeasonId: 25, hasLocalResults: true };
  assert.deepEqual(tournamentMatchNavigation(recorded, options).to, {
    path: '/visualize/match-detail', query: { seasonId: 25, matchId: 900, tab: 'overview' }
  });
  assert.equal(tournamentMatchNavigation({ ...recorded, hasLocalResults: false }, options).preview, true);
  assert.equal(tournamentMatchNavigation({ ...recorded, timestamp: now - 1 }, options).preview, false);
});

test('both table perspectives retain one canonical preview route and source dates', () => {
  const snapshot = { blocks: [
    { type: 'standings', stageId: 'regular-season', rows: match.opponents.map(team => ({ team, matches: '0–0', maps: '0–0' })) },
    { type: 'matches', stageId: 'regular-season', matches: [match] }
  ] };
  const before = structuredClone(snapshot);
  const decorated = attachTournamentNavigation(snapshot, options);
  const table = attachStageResults({ id: 'regular-season', blocks: decorated.blocks }).blocks[0];
  assert.equal(table.resultsStatus.state, 'available');
  const [first, second] = table.rows.map(row => row.games[0]);
  assert.deepEqual(first.navigation.to, second.navigation.to);
  assert.deepEqual(first.opponents, second.opponents);
  assert.equal(first.navigation.date, '10.02');
  const previews = collectTournamentPreviews([table, decorated.blocks[1]]);
  assert.equal(previews.length, 1);
  assert.deepEqual(previews[0].navigation.to, first.navigation.to);
  assert.deepEqual(snapshot, before);
  const blocked = attachTournamentNavigation({ blocks: [{ ...snapshot.blocks[1], stageIssue: 'conflicting-stage' }] }, options);
  assert.equal(blocked.blocks[0].matches[0].navigation.to, null);
});

test('preview list sorts unique games chronologically while retaining later rematches and simultaneous pairings', () => {
  const rematch = { ...match, timestamp: match.timestamp + 86400000 };
  const reversed = { ...match, opponents: [...match.opponents].reverse() };
  const earlier = { ...match, timestamp: match.timestamp - 3600000 };
  const simultaneous = { ...match, opponents: [{ teamId: 31, name: 'Team C' }, { teamId: 32, name: 'Team D' }] };
  const snapshot = { blocks: [
    { type: 'matches', stageId: 'regular-season', matches: [rematch, match, simultaneous, earlier] },
    { type: 'swiss', stageId: 'regular-season', rows: [{ rounds: [reversed, rematch] }] },
    { type: 'bracket', stageId: 'regular-season', matches: [
      { ...match, timestamp: now - 1 },
      { ...match, timestamp: null },
      { ...match, opponents: [{ name: 'TBD' }, match.opponents[1]] },
      { ...match, sourceConflict: true },
      { ...rematch, timestamp: rematch.timestamp + 86400000, hasLocalResults: true, matchId: 900 }
    ] }
  ] };
  const decorated = attachTournamentNavigation(snapshot, options);
  const before = structuredClone(decorated);
  const previews = collectTournamentPreviews(decorated.blocks);
  assert.equal(previews.length, 4);
  assert.equal(new Set(previews.map(item => item.previewKey)).size, 4);
  assert.deepEqual(previews.map(item => item.timestamp), [earlier.timestamp, match.timestamp, simultaneous.timestamp, rematch.timestamp]);
  assert.deepEqual(previews[1].navigation.to, decorated.blocks[0].matches[1].navigation.to);
  assert.deepEqual(decorated, before);
  assert.deepEqual(collectTournamentPreviews(), []);
});
