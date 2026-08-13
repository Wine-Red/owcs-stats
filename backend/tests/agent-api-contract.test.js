const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildOptionalAvailability,
  serializeDuration,
  serializeMapGame,
  serializePlayerStat,
  statusFromAvailability
} = require('../services/AgentApiContract');

const mapGame = overrides => ({
  id: 10,
  matchId: 20,
  Map: { id: 1, name: '国王大道', type: '攻击/护送' },
  team1: { id: 2, name: 'A' },
  team2: { id: 3, name: 'B' },
  winner: { id: 2, name: 'A' },
  team1Score: 3,
  team2Score: 2,
  team1BanHero: null,
  team2BanHero: { id: 4, name: '温斯顿' },
  duration: 0,
  statsVersion: 1,
  ...overrides
});

test('map facts distinguish recorded values from unknown zero or null values', () => {
  assert.deepEqual(serializeDuration(0), { status: 'unknown', seconds: null });
  assert.deepEqual(serializeDuration(null), { status: 'unknown', seconds: null });
  assert.deepEqual(serializeDuration(842), { status: 'recorded', seconds: 842 });

  const result = serializeMapGame(mapGame(), { playerStatCount: 10, heroStatCount: 0 });
  assert.deepEqual(result.bans.team1, { status: 'unknown', hero: null });
  assert.equal(result.bans.team2.status, 'recorded');
  assert.equal(result.duration.status, 'unknown');
  assert.equal(result.availability.player_stats, 'available');
  assert.equal(result.availability.final_blows, 'unavailable');
  assert.equal(result.availability.player_hero_stats, 'unavailable');
});

test('enhanced metrics require actual hero-detail coverage', () => {
  assert.deepEqual(buildOptionalAvailability({
    statsVersion: 2,
    playerStatCount: 10,
    heroStatCount: 0
  }), {
    player_stats: 'available',
    ults_used: 'unknown',
    final_blows: 'unknown',
    player_hero_stats: 'unknown'
  });

  assert.deepEqual(buildOptionalAvailability({
    statsVersion: 2,
    playerStatCount: 10,
    heroStatCount: 12,
    playerStatsWithHeroStats: 6
  }), {
    player_stats: 'available',
    ults_used: 'partial',
    final_blows: 'partial',
    player_hero_stats: 'partial'
  });

  assert.deepEqual(buildOptionalAvailability({
    statsVersion: 2,
    playerStatCount: 10,
    heroStatCount: 18,
    playerStatsWithHeroStats: 10
  }), {
    player_stats: 'available',
    ults_used: 'available',
    final_blows: 'available',
    player_hero_stats: 'available'
  });
});

test('core metrics preserve reliable zeros while unavailable optional metrics become null', () => {
  const row = {
    id: 100,
    player: { id: 6, name: 'Leave', role: 'damage' },
    team: { id: 2, name: 'A' },
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    healing: 0,
    mitigation: 0,
    ultsUsed: 0,
    finalBlows: 0
  };
  const unavailable = serializePlayerStat(row, { ults_used: 'unavailable', final_blows: 'unavailable' });
  assert.equal(unavailable.metrics.kills, 0);
  assert.equal(unavailable.metrics.mitigation, 0);
  assert.equal(unavailable.metrics.ults_used, null);
  assert.equal(unavailable.metrics.final_blows, null);

  const available = serializePlayerStat(row, { ults_used: 'available', final_blows: 'available' });
  assert.equal(available.metrics.ults_used, 0);
  assert.equal(available.metrics.final_blows, 0);
});

test('mixed dataset availability becomes partial', () => {
  assert.equal(statusFromAvailability(['available', 'available']), 'available');
  assert.equal(statusFromAvailability(['available', 'unavailable']), 'partial');
  assert.equal(statusFromAvailability([]), 'unknown');
});
