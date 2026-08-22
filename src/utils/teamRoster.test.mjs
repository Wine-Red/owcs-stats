import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeRegisteredRosterWithStats } from './teamRoster.mjs';

test('shows registered players with zero minutes before the first match', () => {
  const relations = [
    { playerId: 1, Player: { id: 1, name: 'Tank', role: 'tank' } },
    { playerId: 2, Player: { id: 2, name: 'Support', role: 'support' } }
  ];

  assert.deepEqual(mergeRegisteredRosterWithStats(relations, [], 10), [
    { id: 1, name: 'Tank', role: 'tank', gameTime: 0, teamId: 10 },
    { id: 2, name: 'Support', role: 'support', gameTime: 0, teamId: 10 }
  ]);
});

test('merges recorded play time into the registered roster', () => {
  const relations = [
    { playerId: 1, Player: { id: 1, name: 'Player One', role: 'damage' } },
    { playerId: 2, Player: { id: 2, name: 'Player Two', role: 'support' } }
  ];
  const stats = [
    { playerId: 1, teamId: 10, gameTime: 32, player: { id: 1, name: 'P1', role: 'damage' } },
    { playerId: 2, teamId: 99, gameTime: 90, player: { id: 2, name: 'P2', role: 'support' } }
  ];

  assert.deepEqual(mergeRegisteredRosterWithStats(relations, stats, 10), [
    { id: 1, name: 'Player One', role: 'damage', gameTime: 32, teamId: 10 },
    { id: 2, name: 'Player Two', role: 'support', gameTime: 0, teamId: 10 }
  ]);
});

test('retains a stats-only player for compatibility with historical data', () => {
  const stats = [
    { playerId: 3, teamId: 10, totalDuration: 18, player: { id: 3, name: 'Legacy', role: 'tank' } }
  ];

  assert.deepEqual(mergeRegisteredRosterWithStats([], stats, 10), [
    { id: 3, name: 'Legacy', role: 'tank', gameTime: 18, teamId: 10 }
  ]);
});
