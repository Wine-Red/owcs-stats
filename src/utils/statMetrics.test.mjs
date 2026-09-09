import test from 'node:test';
import assert from 'node:assert/strict';
import { perMinute, perTenMinutes, killDeathRatio, killAssistDeathRatio, profileTotalsStat } from './statMetrics.mjs';

test('profile fallback uses the same minute-based duration as season stats', () => {
  const totals = { duration: 30, kills: 60, deaths: 12, assists: 24, damage: 90000 };
  const stat = profileTotalsStat(totals, 'damage');
  assert.equal(stat.gameTime, 30);
  assert.equal(perTenMinutes(stat.elims, stat.gameTime), 20);
  assert.equal(perTenMinutes(stat.damage, stat.gameTime), 30000);
  assert.equal(killDeathRatio(stat.elims, stat.deaths), 5);
  assert.equal(killAssistDeathRatio(stat.elims, stat.assists, stat.deaths), 7);
  assert.equal(profileTotalsStat(null, 'damage'), null);
  assert.equal(totals.duration, 30);
});

test('normal and rounded display paths retain their precision and zero-death convention', () => {
  assert.equal(perMinute(100, 30), 100 / 30);
  assert.equal(perTenMinutes(100, 30), 100 / 30 * 10);
  assert.equal(perTenMinutes(100, 30, 2), 33.33);
  assert.equal(killDeathRatio(10, 3), 10 / 3);
  assert.equal(killDeathRatio(10, 3, 2), 3.33);
  assert.equal(killAssistDeathRatio(10, 1, 3, 2), 3.67);
  assert.equal(killDeathRatio(10, 0, 2), 10);
  assert.equal(killAssistDeathRatio(10, 4, 0, 2), 14);
  assert.equal(perTenMinutes('100', '30', 2), 33.33);
});

test('missing or zero play time cannot produce infinite rates', () => {
  for (const duration of [null, undefined, 0, '0', 'invalid']) {
    assert.equal(perTenMinutes(50, duration, 2), 0);
  }
  assert.equal(perTenMinutes(null, 10), 0);
  assert.equal(killDeathRatio(null, null), 0);
});
