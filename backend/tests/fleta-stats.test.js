const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateMapFleta, calculateSeasonFleta } = require('../services/FletaStatsService');

const players = [
  { id: 1, name: 'Tank', role: 'tank' },
  { id: 2, name: 'Damage', role: 'damage' },
  { id: 3, name: 'Support', role: 'support' },
  { id: 4, name: 'Opponent', role: 'damage' }
];
const game = { id: 11, seasonId: 1, team1Id: 7, team2Id: 8, duration: 10 };
const stats = players.map(player => ({ id: player.id, playerId: player.id, player,
  teamId: player.id === 4 ? 8 : 7, mapGameId: 11, finalBlows: 999 }));
const payload = kills => ({ players: players.map(player => ({ playerId: `source-${player.id}`,
  displayName: player.name, teamSide: player.id === 4 ? 'B' : 'A' })),
events: kills.map((killer, index) => ({ eventId: `e${index}`, type: 'kill', status: 'confirmed',
  killerId: `source-${killer}`, timeMs: index * 1000 })) });

test('all roles use eligible kill events even without hero identity; measured zero is retained', () => {
  const timeline = payload([1, 1, 2, 4]);
  timeline.events.push(
    { ...timeline.events[0] },
    { ...timeline.events[0], eventId: 'candidate', status: 'candidate' },
    { ...timeline.events[0], eventId: 'rejected', status: 'rejected' },
    { ...timeline.events[0], eventId: 'excluded', statisticsEligible: false }
  );
  const result = calculateMapFleta(game, stats, timeline);
  assert.equal(result.get(1).fletaIndex, 400 / 3);
  assert.equal(result.get(2).fletaIndex, 200 / 3);
  assert.equal(result.get(3).fletaIndex, 0);
  assert.equal(result.get(4).fletaIndex, 200);
  assert.equal(result.get(1).teamFinalBlows, 3);
});

test('missing timeline, zero denominator, unknown killer and ambiguous identity never fabricate a value', () => {
  assert.equal(calculateMapFleta(game, stats, null).size, 0);
  assert.equal(calculateMapFleta(game, stats, payload([])).size, 0);
  assert.equal(calculateMapFleta(game, stats, payload([99])).size, 0);
  const timeline = payload([1]);
  timeline.players.push({ playerId: 'other', displayName: 'Tank', teamSide: 'A' });
  assert.equal(calculateMapFleta(game, stats, timeline).has(1), false);
});

test('authoritative source identity survives a display-name change and is scoped to the correct team', () => {
  const renamed = stats.map(stat => stat.playerId === 1
    ? { ...stat, player: { ...stat.player, name: 'Renamed', externalId: 'source-1' } } : stat);
  assert.equal(calculateMapFleta(game, renamed, payload([1, 2])).get(1).fletaIndex, 100);
});

test('season uses ratio of sums over each player appearances, including team changes, not mean map ratios', () => {
  const secondGame = { ...game, id: 12, team1Id: 9 };
  const secondStats = stats.map(stat => ({ ...stat, mapGameId: 12, teamId: stat.teamId === 7 ? 9 : 8 }));
  const result = calculateSeasonFleta({ mapGames: [game, secondGame],
    playerStats: [...stats, ...secondStats], playerById: new Map(players.map(p => [p.id, p])),
    timelines: [{ mapGameId: 11, payload: payload([1, 1, 2]) },
      { mapGameId: 12, payload: payload([1, 2, 2, 2, 2, 2, 2]) }] });
  assert.deepEqual(result.get(1), { fletaIndex: 60, fletaMaps: 2 });
  assert.deepEqual(result.get(3), { fletaIndex: 0, fletaMaps: 2 });
  assert.equal(result.has(4), false);
});

test('season calculator exposes timeline availability and null for players with no covered appearances', async () => {
  const { calculateSeasonPlayerStats } = require('../services/SeasonStatsCalculator');
  const rawData = { matches: [], mapGames: [game], playerStats: stats,
    playerById: new Map(players.map(p => [p.id, p])), gameById: new Map([[11, game]]),
    teamById: new Map([[7, { id: 7 }], [8, { id: 8 }]]), timelines: { 11: { mapGameId: 11, payload: payload([1, 2]) } } };
  let rows = await calculateSeasonPlayerStats(1, { rawData });
  assert.equal(rows.find(row => row.playerId === 1).fletaIndex, 100);
  assert.equal(rows.find(row => row.playerId === 4).fletaIndex, null);
  assert.ok(rows.every(row => row.hasTimeline));
  rows = await calculateSeasonPlayerStats(1, { rawData: { ...rawData, timelines: {} } });
  assert.ok(rows.every(row => row.fletaIndex === null && !row.hasTimeline));
});
