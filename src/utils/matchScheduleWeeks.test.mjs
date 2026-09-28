import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMatchDaysByWeek } from './matchScheduleWeeks.mjs';

const page = 'https://liquipedia.net/overwatch/Test/Regular_Season';
const timestamp = date => Date.parse(`${date}T18:00:00+08:00`);
const beijingDay = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const dates = keys => keys.map(key => ({ key, count: 3 }));
const block = (week, days, extra = {}) => ({
  type: 'matches', sourceUrl: page, sourceTitle: `Week ${week}`,
  sourceHeadings: ['Matches', `Week ${week}`],
  matches: days.map(date => ({ timestamp: timestamp(date) })), ...extra
});
const group = (keys, blocks = [], extra = {}) => groupMatchDaysByWeek(dates(keys), {
  snapshot: { blocks }, toDateKey: beijingDay, ...extra
});
const groupedKeys = result => result.map(item => item.options.map(option => option.key));

test('uses the source competition weeks and sorts days chronologically', () => {
  const days = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-09', '2026-10-10', '2026-10-11'];
  const result = group([...days].reverse(), [block(1, days.slice(0, 3)), block(2, days.slice(3))]);
  assert.deepEqual(groupedKeys(result), [days.slice(0, 3), days.slice(3)]);
  assert.deepEqual(result.map(item => item.label), ['常规赛 · 第 1 周', '常规赛 · 第 2 周']);
  assert.equal(result[0].rangeLabel, '10.02 – 10.04');
});

test('a source Sunday kickoff displayed on Monday stays in the same competition week', () => {
  const source = block(1, ['2026-10-03', '2026-10-04']);
  source.matches.push({ timestamp: Date.parse('2026-10-04T18:00:00Z') });
  const result = group(['2026-10-03', '2026-10-04', '2026-10-05'], [source]);
  assert.equal(result.length, 1);
  assert.equal(result[0].rangeLabel, '10.03 – 10.05');
  const utc = group(['2026-10-03', '2026-10-04'], [source], { toDateKey: time => new Date(time).toISOString().slice(0, 10) });
  assert.equal(utc[0].key, result[0].key);
  assert.equal(utc.length, 1);
});

test('explicit week boundaries take priority over consecutive dates and long rest gaps', () => {
  const result = group(['2026-10-02', '2026-10-07', '2026-10-08'], [
    block(1, ['2026-10-02', '2026-10-07']), block(2, ['2026-10-08'])
  ]);
  assert.deepEqual(groupedKeys(result), [['2026-10-02', '2026-10-07'], ['2026-10-08']]);
});

test('cross-month and cross-year competition weeks retain one group and clear date ranges', () => {
  const days = ['2026-10-31', '2026-11-01', '2026-11-02'];
  const result = group(days, [block(4, days)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].rangeLabel, '10.31 – 11.02');
  const yearDays = ['2026-12-31', '2027-01-01', '2027-01-02'];
  assert.equal(group(yearDays, [block(8, yearDays)])[0].rangeLabel, '2026.12.31 – 2027.01.02');
});

test('partial upcoming data keeps the source week number and does not create empty groups', () => {
  const third = block(3, ['2026-10-16', '2026-10-17', '2026-10-18']);
  const result = group(['2026-10-18'], [block(1, ['2026-10-02']), third, third]);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, '常规赛 · 第 3 周');
  assert.equal(result[0].rangeLabel, '10.16 – 10.18');
  assert.equal(result[0].options.length, 1);
});

test('ticker week anchors work when the tournament snapshot is unavailable', () => {
  const days = ['2026-10-04', '2026-10-05', '2026-10-09'];
  const result = group(days, [], { snapshot: null, matches: days.map((dateKey, index) => ({
    source: 'upcoming', dateKey, link: `${page}#Week_${index < 2 ? 1 : 2}`
  })) });
  assert.deepEqual(groupedKeys(result), [days.slice(0, 2), days.slice(2)]);
  assert.deepEqual(result.map(item => item.label), ['第 1 周', '第 2 周']);
});

test('recorded matches inherit the verified source week while preserving their raw date', () => {
  const source = block(2, ['2026-10-12']);
  source.matches[0].matchId = 42;
  const matches = [{ source: 'recorded', id: 42, dateKey: '2026-10-11' }];
  const result = group(['2026-10-11'], [source], { matches });
  assert.equal(result[0].label, '常规赛 · 第 2 周');
  assert.equal(result[0].options[0].key, '2026-10-11');
  assert.equal(matches[0].dateKey, '2026-10-11');
});

test('unlabelled weekends include Monday and split after at least two full rest days', () => {
  const first = ['2026-10-03', '2026-10-04', '2026-10-05'];
  const second = ['2026-10-09', '2026-10-11', '2026-10-12'];
  const result = group([...first, ...second]);
  assert.deepEqual(groupedKeys(result), [first, second]);
  assert.equal(result[0].label, '比赛周');
});

test('unlabelled runs are bounded by seven event days instead of calendar weekdays', () => {
  const days = Array.from({ length: 10 }, (_, index) => `2026-10-${String(index + 2).padStart(2, '0')}`);
  assert.deepEqual(groupedKeys(group(days)), [days.slice(0, 7), days.slice(7)]);
});

test('complete source dates stabilize unlabelled groups when the visible list is partial', () => {
  const source = block(null, ['2026-10-02', '2026-10-04', '2026-10-06']);
  const result = group(['2026-10-02', '2026-10-06'], [source]);
  assert.equal(result.length, 1);
  assert.equal(result[0].rangeLabel, '10.02 – 10.06');
});

test('stage-specific source pages do not combine restarted week numbers', () => {
  const result = group(['2026-10-02', '2026-11-06'], [
    block(1, ['2026-10-02']), block(1, ['2026-11-06'], { sourceUrl: page.replace('Regular_Season', 'Playoffs') })
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.label), ['常规赛 · 第 1 周', '季后赛 · 第 1 周']);
});

test('an overlapping source day is offered once without inventing an official week', () => {
  const result = group(['2026-10-04', '2026-10-05', '2026-10-06'], [
    block(1, ['2026-10-04', '2026-10-05']), block(2, ['2026-10-05', '2026-10-06'])
  ]);
  assert.equal(result.flatMap(item => item.options).length, 3);
  assert.equal(result.find(item => item.options.some(option => option.key === '2026-10-05')).label, '常规赛');
});

test('unknown dates remain selectable at the end and inputs stay unchanged', () => {
  const options = dates(['tbd', '2026-10-09', '2026-10-02', '2026-02-30']);
  const original = structuredClone(options);
  const result = groupMatchDaysByWeek(options);
  assert.deepEqual(options, original);
  assert.deepEqual(result.at(-1).options.map(option => option.key), ['tbd', '2026-02-30']);
  assert.equal(result.at(-1).label, '时间待定');
  assert.deepEqual(groupMatchDaysByWeek([]), []);
});

const stageBlock = (stage, days, extra = {}) => ({
  type: 'matches', sourceUrl: 'https://liquipedia.net/overwatch/Test',
  sourceTitle: stage, sourceHeadings: ['Results', stage],
  matches: days.map(date => ({ timestamp: timestamp(date) })), ...extra
});

test('stages without official weeks keep their names and split at adjacent stage boundaries', () => {
  const result = group(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'], [
    stageBlock('Swiss Stage', ['2026-10-02', '2026-10-03']),
    stageBlock('Round Robin', ['2026-10-04']),
    stageBlock('Playoffs', ['2026-10-05'])
  ]);
  assert.deepEqual(result.map(item => item.label), ['瑞士轮', '循环赛', '季后赛']);
  assert.deepEqual(groupedKeys(result), [['2026-10-02', '2026-10-03'], ['2026-10-04'], ['2026-10-05']]);
});

test('a multi-week stage retains its stage name in each inferred competition week', () => {
  const days = ['2026-10-02', '2026-10-03', '2026-10-09', '2026-10-10'];
  const result = group(days, [stageBlock('Swiss Stage', days)]);
  assert.deepEqual(result.map(item => item.label), ['瑞士轮', '瑞士轮']);
  assert.deepEqual(groupedKeys(result), [days.slice(0, 2), days.slice(2)]);
});

test('concurrent stages preserve both names while each date stays selectable once', () => {
  const days = ['2026-10-30', '2026-10-31'];
  const result = group(days, [
    stageBlock('Playoffs Seeding Decider Matches', days), stageBlock('Last Chance Qualifier', days)
  ]);
  assert.equal(result.length, 1);
  assert.ok(result[0].label.includes('季后赛种子决定战'));
  assert.ok(result[0].label.includes('最后机会资格赛'));
  assert.deepEqual(groupedKeys(result), [days]);
});

test('verified recorded identities keep adjacent-day timestamps from leaking another stage into a date', () => {
  const groups = stageBlock('Group Stage', ['2026-10-05']);
  const playoffs = stageBlock('Playoffs', ['2026-10-05']);
  groups.matches[0].matchId = 1;
  playoffs.matches[0].matchId = 2;
  const days = ['2026-10-04', '2026-10-05'];
  const matches = days.map((dateKey, index) => ({ source: 'recorded', id: index + 1, dateKey }));
  const result = group(days, [groups, playoffs], { matches });
  assert.deepEqual(result.map(item => item.label), ['小组赛', '季后赛']);
  assert.deepEqual(groupedKeys(result), days.map(date => [date]));
});

test('a recorded playoff date cannot inherit a regular-season week from overlapping source dates', () => {
  const regular = block(4, ['2026-10-04', '2026-10-05']);
  const playoffs = stageBlock('Playoffs', ['2026-10-06']);
  playoffs.matches[0].matchId = 42;
  const result = group(['2026-10-05'], [regular, playoffs], {
    matches: [{ id: 42, source: 'recorded', dateKey: '2026-10-05' }]
  });
  assert.equal(result[0].label, '季后赛');
});

test('a single unnamed bracket uses the explicitly declared whole-event format', () => {
  const bracket = stageBlock('Results', ['2026-05-22', '2026-05-23', '2026-05-24'], { type: 'bracket' });
  const snapshot = { blocks: [bracket], rules: [{ level: 0, original: 'Double elimination bracket' }] };
  const result = group(['2026-05-22', '2026-05-23', '2026-05-24'], [], { snapshot });
  assert.equal(result[0].label, '双败淘汰赛');
  assert.equal(result.length, 1);
});

test('bracket shape or a nested format cannot invent a stage name', () => {
  const bracket = stageBlock('Results', ['2026-05-22'], { type: 'bracket' });
  for (const snapshot of [
    { blocks: [bracket] },
    { blocks: [bracket], rules: [{ level: 1, original: 'Double elimination bracket' }] },
    { blocks: [bracket, stageBlock('Group Stage', ['2026-05-21'])], rules: [{ level: 0, original: 'Double elimination bracket' }] }
  ]) assert.equal(group(['2026-05-22'], [], { snapshot })[0].label, '比赛周');
});
