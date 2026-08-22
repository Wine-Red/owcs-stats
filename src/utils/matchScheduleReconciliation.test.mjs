import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getRecordedMatchState,
  isSameScheduledMatch,
  removeRecordedFromUpcoming
} from './matchScheduleReconciliation.mjs';

const scheduledMatch = ({
  dateKey = '2026-08-20',
  timestamp = 0,
  team1Id,
  team1Name,
  team2Id,
  team2Name
}) => ({
  dateKey,
  timestamp,
  team1: { id: team1Id, name: team1Name },
  team2: { id: team2Id, name: team2Name }
});

test('matches the same dated team pair regardless of side order', () => {
  const upcoming = scheduledMatch({
    team1Id: 1,
    team1Name: 'CHN',
    team2Id: 2,
    team2Name: 'USA'
  });
  const completed = scheduledMatch({
    team1Id: 2,
    team1Name: 'USA',
    team2Id: 1,
    team2Name: 'CHN'
  });

  assert.equal(isSameScheduledMatch(upcoming, completed), true);
});

test('falls back to normalized names when an external team has no local id', () => {
  const upcoming = scheduledMatch({ team1Name: ' Team-China ', team2Name: 'Team_USA' });
  const completed = scheduledMatch({ team1Name: 'team china', team2Name: 'team usa' });

  assert.equal(isSameScheduledMatch(upcoming, completed), true);
});

test('keeps matches on a different date or against a different opponent', () => {
  const completed = scheduledMatch({ team1Id: 1, team1Name: 'CHN', team2Id: 2, team2Name: 'USA' });
  const differentDate = scheduledMatch({
    dateKey: '2026-08-21',
    team1Id: 1,
    team1Name: 'CHN',
    team2Id: 2,
    team2Name: 'USA'
  });
  const differentOpponent = scheduledMatch({
    team1Id: 1,
    team1Name: 'CHN',
    team2Id: 3,
    team2Name: 'KOR'
  });

  assert.deepEqual(
    removeRecordedFromUpcoming([differentDate, differentOpponent], [completed]),
    [differentDate, differentOpponent]
  );
});

test('consumes recorded matches once so a same-day rematch remains visible', () => {
  const first = scheduledMatch({
    timestamp: 1,
    team1Id: 1,
    team1Name: 'CHN',
    team2Id: 2,
    team2Name: 'USA'
  });
  const rematch = scheduledMatch({
    timestamp: 2,
    team1Id: 1,
    team1Name: 'CHN',
    team2Id: 2,
    team2Name: 'USA'
  });
  const completed = scheduledMatch({
    team1Id: 1,
    team1Name: 'CHN',
    team2Id: 2,
    team2Name: 'USA'
  });

  assert.deepEqual(removeRecordedFromUpcoming([first, rematch], [completed]), [rematch]);
});

test('does not reconcile unknown or TBD pairings', () => {
  const upcoming = scheduledMatch({ team1Name: 'TBD', team2Name: 'USA' });
  const completed = scheduledMatch({ team1Name: 'TBD', team2Name: 'USA' });

  assert.equal(isSameScheduledMatch(upcoming, completed), false);
});

test('keeps a recorded BO5 match ongoing until either team reaches three wins', () => {
  assert.equal(getRecordedMatchState({ boFormat: 'BO5', team1Score: 0, team2Score: 2 }), 'ongoing');
  assert.equal(getRecordedMatchState({ boFormat: 'BO5', team1Score: 3, team2Score: 2 }), 'completed');
});

test('derives the winning score from other best-of formats', () => {
  assert.equal(getRecordedMatchState({ boFormat: 'BO3', team1Score: 1, team2Score: 0 }), 'ongoing');
  assert.equal(getRecordedMatchState({ boFormat: 'BO3', team1Score: 2, team2Score: 0 }), 'completed');
  assert.equal(getRecordedMatchState({ boFormat: 'BO7', team1Score: 2, team2Score: 3 }), 'ongoing');
  assert.equal(getRecordedMatchState({ boFormat: 'BO7', team1Score: 2, team2Score: 4 }), 'completed');
});

test('preserves completed behavior when a legacy match has no recognized format', () => {
  assert.equal(getRecordedMatchState({ boFormat: '', team1Score: 0, team2Score: 0 }), 'completed');
});
