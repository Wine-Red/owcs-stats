import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getDefaultSeason,
  sortSeasonGroupsNewestFirst,
  sortSeasonsNewestFirst
} from './seasonSelection.mjs'

test('sorts seasons from newest to oldest by numeric id without mutating the source', () => {
  const seasons = [
    { id: 13, name: 'first' },
    { id: '23', name: 'latest' },
    { id: 20, name: 'middle' }
  ]

  assert.deepEqual(sortSeasonsNewestFirst(seasons).map(season => Number(season.id)), [23, 20, 13])
  assert.deepEqual(seasons.map(season => Number(season.id)), [13, 23, 20])
})

test('selects the newest in-progress season when one exists', () => {
  const selected = getDefaultSeason([
    { id: 28, status: 'completed' },
    { id: 30, status: 'in_progress' },
    { id: 29, status: 'in_progress' }
  ])

  assert.equal(selected.id, 30)
})

test('sorts stage groups by the newest season id in each group', () => {
  const groups = [
    { label: '2026 S1', options: [{ id: 12 }, { id: 7 }] },
    { label: '2026 OWWC', options: [{ id: 24 }] },
    { label: '2026 S2', options: [{ id: 23 }, { id: 13 }] }
  ]

  assert.deepEqual(sortSeasonGroupsNewestFirst(groups).map(group => group.label), [
    '2026 OWWC',
    '2026 S2',
    '2026 S1'
  ])
})

test('selects the maximum id when every season is completed', () => {
  const selected = getDefaultSeason([
    { id: 7, status: 'completed' },
    { id: 23, status: 'completed' },
    { id: 14, status: 'completed' }
  ])

  assert.equal(selected.id, 23)
})

test('returns null when there are no seasons', () => {
  assert.equal(getDefaultSeason([]), null)
})
