const test = require('node:test');
const assert = require('node:assert/strict');
const { planMerge } = require('../services/EntityMergeService');
const { resolveSourcePlayer } = require('../services/PlayerIdentityService');
const { matchRoster } = require('../services/LiquipediaRosterMatcher');

const snapshot = kind => ({ unknownReferences: [], rows: {
  [kind === 'team' ? 'teams' : 'players']: [
    { id: 1, name: 'Old', region: 'KR', role: 'support', externalId: 'old-id' },
    { id: 2, name: 'Current', region: 'KR', role: 'support', externalId: 'new-id' }
  ],
  team_aliases: [], player_aliases: [], player_external_identities: [], entity_redirects: [],
  matches: [], map_games: [], player_stats: [], season_teams: [], season_team_players: [],
  season_team_sources: [], season_team_player_sources: [], match_polls: [], match_votes: []
} });

test('team merge moves every match reference, votes, aliases and pages without rewriting statistics', () => {
  const data = snapshot('team');
  data.rows.teams[0].liquipediaUrl = 'https://liquipedia.net/overwatch/Old';
  data.rows.teams[1].liquipediaUrl = 'https://liquipedia.net/overwatch/Current';
  data.rows.matches.push({ id: 9, team1Id: 1, team2Id: 3, winnerId: 1 });
  data.rows.player_stats.push({ id: 10, teamId: 1, kills: 17, playerId: 42 });
  data.rows.match_polls.push({ id: 11, sourceId: 'poll', team1Id: 1, team2Id: 3, pairKey: '1:3' });
  data.rows.match_votes.push({ id: 12, pollId: 11, teamId: 1 });
  const before = JSON.stringify(data);
  const { preview, operations } = planMerge('team', 1, 2, data);
  assert.equal(preview.canMerge, true);
  assert.deepEqual(preview.aliases, ['Old']);
  assert.equal(preview.liquipediaUrls.length, 2);
  assert.deepEqual(operations.find(op => op.table === 'matches').values, { team1Id: 2, winnerId: 2 });
  assert.deepEqual(operations.find(op => op.table === 'player_stats').values, { teamId: 2 });
  assert.equal(operations.find(op => op.table === 'match_polls').values.pairKey, '2:3');
  assert.equal(operations.find(op => op.table === 'match_votes').values.teamId, 2);
  assert.equal(JSON.stringify(data), before);
});

test('self opponents, third-party aliases, unknown references and colliding polls block merging', () => {
  const data = snapshot('team');
  data.rows.matches.push({ id: 1, team1Id: 1, team2Id: 2 });
  data.rows.teams.push({ id: 3, name: 'Old', region: 'KR' });
  data.rows.match_polls.push({ id: 5, sourceId: 'same', team1Id: 1, team2Id: 3 }, { id: 6, sourceId: 'same', team1Id: 2, team2Id: 3 });
  data.unknownReferences.push('future_table.playerId');
  const { preview } = planMerge('team', 1, 2, data);
  assert.equal(preview.canMerge, false);
  for (const code of ['SELF_OPPONENT', 'ALIAS_CONFLICT', 'POLL_COLLISION', 'UNKNOWN_REFERENCE']) assert.ok(preview.conflicts.some(row => row.code === code));
});

test('player overlap is a blocking conflict, never a sum or a chosen winner', () => {
  const data = snapshot('player');
  data.rows.player_stats.push({ id: 8, mapGameId: 12, playerId: 1 }, { id: 9, mapGameId: 12, playerId: 2 });
  const { preview } = planMerge('player', 1, 2, data);
  assert.deepEqual(preview.conflicts.find(c => c.code === 'PLAYER_MAP_OVERLAP').ids, [12]);
  data.timelinePlayers = [{ mapGameId: 20, playerIds: ['old-id', 'new-id'] }];
  assert.deepEqual(planMerge('player', 1, 2, data).preview.conflicts.find(c => c.code === 'PLAYER_TIMELINE_OVERLAP').ids, [20]);
});

test('duplicate memberships merge active evidence and dates without losing distinct sources', () => {
  const data = snapshot('player');
  data.rows.season_team_players = [
    { id: 10, seasonTeamId: 8, playerId: 1, joinDate: '2026-01-01', leaveDate: '2026-02-01' },
    { id: 11, seasonTeamId: 8, playerId: 2, joinDate: '2026-01-15', leaveDate: null }
  ];
  data.rows.season_team_player_sources = [
    { id: 20, seasonTeamPlayerId: 10, sourceType: 'manual', sourceKey: 'admin', active: true, firstSeenAt: '2026-01-01', lastSeenAt: '2026-01-20' },
    { id: 21, seasonTeamPlayerId: 11, sourceType: 'manual', sourceKey: 'admin', active: false, firstSeenAt: '2026-01-05', lastSeenAt: '2026-01-10' },
    { id: 22, seasonTeamPlayerId: 10, sourceType: 'match', sourceKey: 'match-1', active: true }
  ];
  const { preview, operations } = planMerge('player', 1, 2, data);
  assert.equal(preview.coalescedMemberships, 1);
  assert.deepEqual(operations.find(op => op.table === 'season_team_player_sources' && op.id === 21).values,
    { active: true, firstSeenAt: '2026-01-01', lastSeenAt: '2026-01-20' });
  assert.deepEqual(operations.find(op => op.table === 'season_team_player_sources' && op.id === 22).values, { seasonTeamPlayerId: 11 });
  assert.equal(operations.find(op => op.table === 'season_team_players' && op.type === 'update').values.leaveDate, null);
  assert.deepEqual(preview.externalIds, ['old-id', 'new-id']);
});

test('sync resolves all mapped IDs, rejects ambiguous names and does not merge unknown authoritative homonyms', () => {
  const caches = { players: [{ id: 2, name: 'Current', role: 'support', externalId: 'new-id' }],
    playerExternalIdentities: [{ playerId: 2, source: 'matchweb', normalizedExternalId: 'old-id' }],
    playerAliases: [{ playerId: 2, alias: 'Old', normalizedAlias: 'old' }] };
  assert.equal(resolveSourcePlayer({ name: 'Old', playerId: 'OLD-ID' }, 'support', caches).id, 2);
  assert.equal(resolveSourcePlayer({ name: 'Old' }, 'support', caches).id, 2);
  assert.equal(resolveSourcePlayer({ name: 'Current', playerId: 'unseen-id' }, 'support', caches), null);
  assert.equal(resolveSourcePlayer({ name: 'Old', playerId: 'unseen-id' }, 'support', caches).id, 2);
  assert.throws(() => resolveSourcePlayer({ name: 'Old', playerId: 'another-id' }, 'tank', caches), /位置不一致/);
  caches.players.push({ id: 3, name: 'Old', role: 'support' });
  assert.throws(() => resolveSourcePlayer({ name: 'Old' }, 'support', caches), /多个候选/);
  assert.throws(() => resolveSourcePlayer({ name: 'Old', playerId: 'third-id' }, 'support', caches), /多个候选/);
});

test('Liquipedia uses confirmed aliases but retains cross-team and role checks', () => {
  const result = matchRoster({ teams: [{ name: 'Old Team', shortNames: ['OLD'], link: 'team', players: [{ name: 'Old', role: 'support', link: 'player' }] }], warnings: [] },
    { teams: [{ id: 2, name: 'Current Team', aliases: ['OLD'] }], players: [{ id: 5, name: 'Current', aliases: ['Old'], role: 'support' }] });
  assert.equal(result.teams[0].teamId, 2);
  assert.equal(result.teams[0].players[0].playerId, 5);
  assert.equal(result.teams[0].players[0].status, 'matched');
});
