import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { groupTournamentStages, selectTournamentStage, tournamentStageDisplayBlocks } from './tournamentStages.mjs';
import { formatStageDateRange, parseStageDateRange, stageDateRange, tournamentYear } from './tournamentStageDates.mjs';

const require = createRequire(import.meta.url);
const { parseTournamentHtml } = require('../../backend/services/LiquipediaTournamentParser');
const { loadTournamentSnapshot } = require('../../backend/services/TournamentSnapshotLoader');
const { parseTournamentUrl } = require('../../backend/services/LiquipediaRosterParser');
const sources = require('../../backend/tests/fixtures/tournaments/sources.json');
const fixture = async name => ({ ...sources[name], html: await readFile(new URL(`../../backend/tests/fixtures/tournaments/${name}.html`, import.meta.url), 'utf8') });
const parsed = async name => parseTournamentHtml(await fixture(name));
const load = async (rootName, childName) => loadTournamentSnapshot(parseTournamentUrl(sources[rootName].sourceUrl), {
  fetchPage: async ({ page }) => fixture(page.endsWith('/Regular Season') ? childName : rootName),
  fetchCanonicalPages: async () => ({})
});
const legacy = data => {
  const copy = structuredClone(data);
  copy.blocks.forEach(block => { delete block.sourceHeadings; });
  return copy;
};
const shape = data => groupTournamentStages(data).map(stage => ({ id: stage.id, blocks: stage.blocks.map(block => block.id) }));

test('World Cup group tables and match lists share one stage; playoffs include third place', async () => {
  const data = await parsed('world');
  const before = structuredClone(data);
  const stages = groupTournamentStages(data);
  assert.deepEqual(stages.map(stage => stage.title), ['小组赛', '季后赛']);
  assert.equal(stages[0].blocks.filter(block => block.rows).length, 4);
  assert.equal(stages[0].blocks.flatMap(block => block.matches || []).length, 24);
  assert.equal(stages[1].blocks[0].matches.length, 8);
  assert.ok(stages[1].blocks[0].matches.some(match => match.round === '季军赛'));
  assert.deepEqual(data.blocks[0].sourceHeadings, ['Results', 'Group Stage', 'Group A']);
  assert.deepEqual(shape(legacy(data)), shape(data));
  assert.deepEqual(data, before);
});

test('China Swiss standings, four rounds and all seeding games stay together across root and child pages', async () => {
  const data = await load('china2', 'china2-regular');
  const stages = groupTournamentStages(data);
  assert.deepEqual(stages.map(stage => stage.title), ['瑞士轮', '循环赛', '季后赛']);
  const [swiss, roundRobin, playoffs] = stages;
  assert.equal(swiss.blocks.filter(block => block.type === 'swiss').length, 1);
  assert.equal(swiss.blocks.filter(block => block.type === 'bracket').length, 3);
  assert.equal(swiss.blocks.flatMap(block => block.matches || []).length, 15);
  assert.deepEqual(swiss.blocks.filter(block => block.type === 'matches').map(block => block.title), ['第 1 轮', '第 2 轮', '第 3 轮', '第 4 轮']);
  assert.equal(roundRobin.blocks.filter(block => block.type === 'standings').length, 1);
  assert.equal(roundRobin.blocks.flatMap(block => block.matches || []).length, 15);
  assert.equal(playoffs.blocks.flatMap(block => block.matches || []).length, 6);
  assert.equal(stages.flatMap(stage => stage.blocks).length, data.blocks.length);
  assert.equal(new Set(stages.flatMap(stage => stage.blocks.map(block => block.id))).size, data.blocks.length);
  assert.deepEqual(shape(legacy(data)), shape(data));
  const child = await parsed('china2-regular');
  assert.deepEqual(child.blocks[2].sourceHeadings, ['Matches', 'Swiss Stage', 'Round 1']);
});

test('EMEA weekly rounds stay in regular season; a round-robin format description does not create another phase', async () => {
  const data = await load('emea2', 'emea2-regular');
  const stages = groupTournamentStages(data);
  assert.deepEqual(stages.map(stage => stage.title), ['常规赛', '季后赛']);
  assert.equal(stages[0].blocks.flatMap(block => block.matches || []).length, 15);
  assert.deepEqual(shape(legacy(data)), shape(data));
});

test('GSL group brackets belong to groups regardless of elimination rules or bracket headers', () => {
  const blocks = ['Group A', 'Group B', 'Playoffs'].map((title, id) => ({
    id, type: 'bracket', sourceTitle: title,
    sourceHeadings: ['Results', ...(title === 'Playoffs' ? [] : ['Group Stage']), title],
    matches: [{ sourceRound: 'Upper Bracket Final' }, { sourceRound: 'Lower Bracket Final' }]
  }));
  assert.deepEqual(groupTournamentStages({ blocks }).map(stage => stage.blocks.map(block => block.id)), [[0, 1], [2]]);
  assert.deepEqual(shape(legacy({ blocks })), shape({ blocks }));
});

test('Korea seeding round robin and last chance qualifier are separate from the actual playoffs', async () => {
  const data = await parsed('korea2');
  const blocks = [
    { id: 'regular', type: 'standings', sourceTitle: 'Regular Season', rows: [{}] },
    { id: 'seeding', type: 'matches', sourceTitle: 'Playoffs Seeding Decider Matches', matches: [{ id: 'seed-match' }] },
    ...data.blocks
  ];
  const stages = groupTournamentStages({ blocks, rules: [
    { level: 0, original: 'Regular Season: June 5th - June 28th' },
    { level: 1, original: 'Round Robin' },
    { level: 0, original: 'Playoffs Seeding Decider Matches: July 3rd - 5th' },
    { level: 1, original: 'Single Round Robin' },
    { level: 0, original: 'Last Chance Qualifier: July 3rd - 5th' },
    { level: 0, original: 'Regional Playoffs: July 10th - 12th' }
  ] });
  assert.deepEqual(stages.map(stage => stage.title), ['常规赛', '季后赛种子决定战', '最后机会资格赛', '季后赛']);
  assert.equal(tournamentStageDisplayBlocks(stages[1])[0].id, blocks[1].id);
  assert.equal(tournamentStageDisplayBlocks(stages[1])[0].title, '季后赛种子决定战 · 赛程');
});

test('legacy playoff wording is normalized for display without changing source snapshots', () => {
  const block = { id: 'old', title: '淘汰赛', sourceTitle: 'Playoffs', type: 'bracket', matches: [] };
  const [stage] = groupTournamentStages({ blocks: [block] });
  assert.equal(tournamentStageDisplayBlocks(stage)[0].title, '季后赛');
  assert.equal(block.title, '淘汰赛');
});

test('explicit parent phase wins over generic subgroup names and Swiss evidence elsewhere', () => {
  const data = { blocks: [
    { id: 'swiss', type: 'swiss', sourceTitle: 'Swiss Stage', rows: [] },
    { id: 'qualifier', type: 'bracket', sourceTitle: 'Group A', sourceHeadings: ['Last Chance Qualifier', 'Group A'] },
    { id: 'decider', type: 'bracket', sourceTitle: 'Seeding Decider Matches', sourceHeadings: ['Group Stage', 'Seeding Decider Matches'] },
    { id: 'unknown', type: 'bracket', sourceTitle: 'Special Decider', matches: [{ sourceRound: 'Decider' }] }
  ] };
  assert.deepEqual(groupTournamentStages(data).map(stage => [stage.id, stage.blocks[0].id]), [
    ['swiss', 'swiss'], ['last-chance', 'qualifier'], ['groups', 'decider'], ['other', 'unknown']
  ]);
});

test('subphases of regular season keep its position before playoffs when sourced from child pages', () => {
  const data = { rules: [
    { level: 0, original: 'Regular Season: June 1st - 20th' },
    { level: 0, original: 'Regional Playoffs: June 25th' }
  ], blocks: [
    { id: 'final', type: 'bracket', sourceTitle: 'Regional Playoffs' },
    { id: 'swiss', type: 'swiss', sourceTitle: 'Standings - Swiss Stage' },
    { id: 'round-robin', type: 'standings', sourceTitle: 'Standings - Round Robin Stage' }
  ] };
  assert.deepEqual(groupTournamentStages(data).map(stage => stage.id), ['swiss', 'round-robin', 'playoffs']);
});

test('unpublished stages do not create empty tabs, and unknown structures remain available', async () => {
  const stages = groupTournamentStages(await parsed('na3'));
  assert.deepEqual(stages.map(stage => stage.title), ['季后赛']);
  const block = { id: 'unknown', sourceTitle: 'Results', type: 'bracket', matches: [] };
  const unknown = groupTournamentStages({ blocks: [block] });
  assert.equal(unknown[0].title, '赛事进程');
  assert.deepEqual(unknown[0].blocks, [block]);
  assert.deepEqual(groupTournamentStages(null), []);
});

test('valid stage links override time; invalid or removed stages use the dated default', async () => {
  const stages = groupTournamentStages(await parsed('china2'));
  const duringSwiss = Date.parse('2026-06-10T00:00:00+08:00');
  const afterSeason = Date.parse('2026-09-28T00:00:00+08:00');
  assert.equal(selectTournamentStage(stages, 'playoffs', duringSwiss).id, 'playoffs');
  assert.equal(selectTournamentStage(stages, 'swiss', afterSeason).id, 'swiss');
  assert.equal(selectTournamentStage(stages, 'groups', duringSwiss).id, 'swiss');
  assert.equal(selectTournamentStage(stages, undefined, afterSeason).id, 'playoffs');
  assert.equal(selectTournamentStage([], 'playoffs', afterSeason), null);
  assert.equal(selectTournamentStage(stages.slice(0, 2), 'playoffs', afterSeason).id, 'round-robin');
});

test('dated defaults cover upcoming, active, breaks, completion and Beijing midnight boundaries', async () => {
  const stages = groupTournamentStages(await parsed('world'));
  for (const [now, expected] of [
    ['2026-08-01T00:00:00Z', 'groups'],
    ['2026-08-20T00:00:00Z', 'groups'],
    ['2026-08-23T15:59:59Z', 'groups'],
    ['2026-08-23T16:00:00Z', 'playoffs'],
    ['2026-09-11T15:59:59Z', 'playoffs'],
    ['2026-09-11T16:00:00Z', 'playoffs'],
    ['2026-09-13T15:59:59Z', 'playoffs'],
    ['2026-09-28T00:00:00Z', 'playoffs']
  ]) assert.equal(selectTournamentStage(stages, undefined, Date.parse(now)).id, expected, now);
  const china = groupTournamentStages(await parsed('china2'));
  assert.equal(selectTournamentStage(china, undefined, Date.parse('2026-06-18T12:00:00Z')).id, 'round-robin');
  assert.equal(selectTournamentStage(china, 'swiss', Date.parse('2026-06-18T12:00:00Z')).id, 'swiss');
  assert.equal(selectTournamentStage(china, 'removed-stage', Date.parse('2026-06-18T12:00:00Z')).id, 'round-robin');
  assert.equal(selectTournamentStage(china, undefined, Date.parse('2026-06-19T12:00:00Z')).id, 'round-robin');
  assert.equal(selectTournamentStage(china, undefined, Date.parse('2026-07-03T12:00:00Z')).id, 'playoffs');
});

test('concurrent, single-day, cross-year and missing dates have deterministic defaults', () => {
  const dated = (id, startDate, endDate = startDate) => ({ id, dateRange: { startDate, endDate } });
  const phases = [dated('seeding', '2026-10-30', '2026-11-01'), dated('last-chance', '2026-10-30', '2026-11-01'), dated('playoffs', '2026-11-06')];
  assert.equal(selectTournamentStage(phases, null, '2026-10-29T00:00:00Z').id, 'seeding');
  assert.equal(selectTournamentStage(phases, null, '2026-10-31T00:00:00Z').id, 'seeding');
  assert.equal(selectTournamentStage(phases, 'last-chance', '2026-10-31T00:00:00Z').id, 'last-chance');
  assert.equal(selectTournamentStage(phases, null, '2026-11-02T00:00:00Z').id, 'playoffs');
  assert.equal(selectTournamentStage(phases, null, '2026-11-06T15:59:59Z').id, 'playoffs');
  const crossing = [dated('groups', '2026-12-30', '2027-01-02'), dated('playoffs', '2027-01-05')];
  assert.equal(selectTournamentStage(crossing, null, '2027-01-03T00:00:00Z').id, 'playoffs');
  assert.equal(selectTournamentStage(crossing, null, '2027-01-04T16:00:00Z').id, 'playoffs');
  const unknown = [{ id: 'unknown', dateRange: null }, dated('invalid', '2026-02-30'), dated('reversed', '2026-11-07', '2026-11-01')];
  assert.equal(selectTournamentStage(unknown, null, '2026-09-28T00:00:00Z').id, 'unknown');
  assert.equal(selectTournamentStage([...unknown, ...phases], null, '2026-11-06T00:00:00Z').id, 'playoffs');
  assert.equal(selectTournamentStage([...unknown, ...phases], 'unknown', '2026-11-06T00:00:00Z').id, 'unknown');
  const reordered = [phases[2], dated('regular', '2026-10-02', '2026-10-25'), ...phases.slice(0, 2)];
  assert.equal(selectTournamentStage(reordered, null, '2026-10-26T00:00:00Z').id, 'seeding');
});

test('source Format dates bind to China subphases and World Cup groups, including legacy snapshots', async () => {
  for (const [name, expected] of [
    ['china2', [['2026-06-06', '2026-06-14'], ['2026-06-19', '2026-06-28'], ['2026-07-04', '2026-07-05']]],
    ['world', [['2026-08-20', '2026-08-23'], ['2026-09-12', '2026-09-13']]],
    ['na3', [['2026-10-30', '2026-11-01']]]
  ]) {
    const data = await parsed(name);
    for (const snapshot of [data, legacy(data)]) {
      const stages = groupTournamentStages(snapshot);
      assert.deepEqual(stages.map(stage => [stage.dateRange.startDate, stage.dateRange.endDate]), expected);
      assert.ok(stages.every(stage => stage.dateRange.source === 'format' && stage.dateRange.sourceText));
    }
  }
});

test('stage dates handle a single day, repeated months, cross-month and cross-year ranges as calendar dates', () => {
  const cases = [
    ['June 5th - June 28th', 2026, '2026-06-05', '2026-06-28'],
    ['October 30th – November 1st', 2026, '2026-10-30', '2026-11-01'],
    ['July 4th', 2026, '2026-07-04', '2026-07-04'],
    ['December 30th - January 2nd', 2026, '2026-12-30', '2027-01-02'],
    ['December 30, 2026 - January 2, 2027', null, '2026-12-30', '2027-01-02'],
    ['June 5th - 28th, 2027', 2026, '2027-06-05', '2027-06-28'],
    ['Feb. 29th, 2024', null, '2024-02-29', '2024-02-29'],
    ['2026-06-06 — 2026-06-14', null, '2026-06-06', '2026-06-14']
  ];
  for (const [text, year, startDate, endDate] of cases) {
    const range = parseStageDateRange(`Playoffs: ${text}`, year);
    assert.ok(range, text);
    assert.equal(range.startDate, startDate, text);
    assert.equal(range.endDate, endDate, text);
  }
  assert.equal(formatStageDateRange({ startDate: '2026-07-04', endDate: '2026-07-04' }), '07.04');
  assert.equal(formatStageDateRange({ startDate: '2026-12-30', endDate: '2027-01-02' }), '2026.12.30 — 2027.01.02');
});

test('invalid, ambiguous or missing dates are not replaced with sync dates or partial match bounds', () => {
  for (const text of ['TBD', 'February 30th - March 1st', 'June 14th - 6th', '2026-02-29', 'June 6th - TBD', 'June 6th - 7th, 13th - 14th']) {
    assert.equal(parseStageDateRange(`Playoffs: ${text}`, 2026), null, text);
  }
  assert.equal(parseStageDateRange('Playoffs: June 6th - 14th', null), null);
  assert.equal(tournamentYear({ page: 'Test/2025/2026' }), null);
  assert.equal(tournamentYear({ sourceUrl: 'https://liquipedia.net/overwatch/Test/2026' }), 2026);
  assert.equal(stageDateRange([
    { original: 'Playoffs: June 6th - 14th' }, { original: 'Playoffs: June 7th - 14th' }
  ], 2026), null);
  const [stage] = groupTournamentStages({ page: 'Test/2026', observedAt: Date.now(), blocks: [
    { id: 'p', sourceTitle: 'Playoffs', type: 'bracket', matches: [{ timestamp: Date.parse('2026-06-06T12:00:00Z') }] }
  ] });
  assert.equal(stage.dateRange, null);
  assert.equal(formatStageDateRange(stage.dateRange), '日期待定');
});

test('concurrent Korea phases keep independent equal dates, and broad regular season dates do not leak to Swiss', () => {
  const stages = groupTournamentStages({ page: 'Test/2026', blocks: [
    { id: 's', type: 'standings', sourceTitle: 'Playoffs Seeding Decider Matches' },
    { id: 'l', type: 'bracket', sourceTitle: 'Last Chance Qualifier' }
  ], rules: [
    { level: 0, original: 'Playoffs Seeding Decider Matches: July 3rd - 5th' },
    { level: 0, original: 'Last Chance Qualifier: July 3rd - 5th' }
  ] });
  assert.equal(stages.length, 2);
  assert.ok(stages.every(stage => stage.dateRange.startDate === '2026-07-03' && stage.dateRange.endDate === '2026-07-05'));
  const [swiss] = groupTournamentStages({ page: 'Test/2026', blocks: [
    { id: 'swiss', type: 'swiss', sourceTitle: 'Regular Season' }
  ], rules: [{ level: 0, original: 'Regular Season: June 1st - 30th' }] });
  assert.equal(swiss.dateRange, null);
});
