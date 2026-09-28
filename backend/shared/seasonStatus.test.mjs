import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSeasonDateRange, presentSeason, seasonStatusForDateRange } from './seasonStatus.mjs';

test('season status follows Shanghai calendar dates including both boundary days', () => {
  const range = '2026.10.02 - 2026.11.08';
  assert.equal(seasonStatusForDateRange(range, Date.parse('2026-10-01T15:59:59Z')), 'upcoming');
  assert.equal(seasonStatusForDateRange(range, Date.parse('2026-10-01T16:00:00Z')), 'in_progress');
  assert.equal(seasonStatusForDateRange(range, Date.parse('2026-11-08T15:59:59Z')), 'in_progress');
  assert.equal(seasonStatusForDateRange(range, Date.parse('2026-11-08T16:00:00Z')), 'completed');
});

test('legacy spacing works and invalid dates cannot retain stale manual status', () => {
  assert.deepEqual(parseSeasonDateRange('2026.03.21-2026.04.26'), { start: '2026-03-21', end: '2026-04-26' });
  for (const value of ['', '2026.02.30 - 2026.03.01', '2026.11.08 - 2026.10.02']) {
    assert.equal(seasonStatusForDateRange(value), null);
    assert.equal(presentSeason({ id: 1, status: 'in_progress' }, value).status, 'unknown');
  }
});
