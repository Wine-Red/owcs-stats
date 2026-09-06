import test from 'node:test';
import assert from 'node:assert/strict';
import { recentTeamMatches, teamScore, aggregateRecentPlayers, resolvePreviewTeam } from './recentTeamForm.mjs';

test('recent form crosses seasons, excludes live/future matches and takes only ten', () => {
  const matches = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1, seasonId: i % 2 + 24, team1Id: 64, team2Id: 58,
    matchDate: `2026-08-${String(i + 1).padStart(2, '0')}`, boFormat: 'BO5',
    winnerId: 64, team1Score: 3, team2Score: 1
  }));
  matches.push({ ...matches[0], id: 99, matchDate: '2026-09-02', team1Score: 1 });
  matches.push({ ...matches[0], id: 100, matchDate: '2027-01-01' });
  const recent = recentTeamMatches(matches, '64', Date.parse('2026-09-07'));
  assert.deepEqual(recent.map(m => m.id), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  assert.equal(new Set(recent.map(m => m.seasonId)).size, 2);
  assert.deepEqual(teamScore(recent, 58), { matchWin: 0, matchLoss: 10, mapWin: 10, mapLoss: 30, mapDiff: -20 });
  assert.deepEqual(recentTeamMatches(matches, null), []);
});

test('player totals use only the selected team and its own recent map sample', () => {
  const games = [{ id: 1, duration: 10 }, { id: 2, duration: 5 }];
  const stats = [
    { mapGameId: 1, playerId: 7, teamId: 64, kills: 10, damage: 100 },
    { mapGameId: 2, playerId: 7, teamId: 64, kills: 4, damage: 50 },
    { mapGameId: 1, playerId: 7, teamId: 58, kills: 99 },
    { mapGameId: 3, playerId: 7, teamId: 64, kills: 99 }
  ];
  const [player] = aggregateRecentPlayers(games, stats, 64);
  assert.equal(player.elims, 14);
  assert.equal(player.gameTime, 15);
  assert.equal(player.damage, 150);
  assert.equal(aggregateRecentPlayers([games[0]], stats, 64)[0].elims, 10);
});

test('team identity supports aliases without ambiguous substring matching', () => {
  const teams = [{ id: 1, name: 'SAU', aliases: ['KSA'] }, { id: 2, name: 'Team SAU' }];
  assert.equal(resolvePreviewTeam(teams, 'ksa').id, 1);
  assert.equal(resolvePreviewTeam(teams, 'SAU').id, 1);
  assert.equal(resolvePreviewTeam(teams, ''), null);
});
