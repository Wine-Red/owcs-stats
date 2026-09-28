const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTournamentSource, resolveTournamentSeasonIds, resolveTournamentSourcePages } = require('../services/TournamentSourceResolver');
const root = 'https://liquipedia.net/overwatch/';
test('voting scope permits only verified children of the exact saved tournament', () => {
  const source = `${root}Test_Event`, page = 'Test Event';
  const snapshot = { page, blocks: [{ sourceUrl: source + '/Playoffs', stageIssue: 'stage-conflict' }],
    sources: [{ url: source }, { url: source + '/Regular_Season' }, { url: source + '/Playoffs' },
      { url: `${root}Test_Event_2/Regular_Season` }, { url: 'https://example.com/private' }] };
  assert.deepEqual(resolveTournamentSourcePages(source, snapshot), [page, page + '/Regular Season']);
  assert.deepEqual(resolveTournamentSourcePages(source, { ...snapshot, page: 'Old Event' }), [page]);
  assert.deepEqual(resolveTournamentSourcePages(source, { ...snapshot, blocks: [] }), [page]);
});
test('all regional stages resolve without database IDs, including the distinct Korea path', () => {
  for (const [region, code] of [['国服', 'China'], ['北美', 'NA'], ['欧中非', 'EMEA'], ['韩国', 'Korea']]) {
    for (const [i, stage] of ['一', '二', '三'].entries()) {
      const suffix = code === 'Korea' ? `Asia/Stage_${i + 1}/Korea` : `${code}/Stage_${i + 1}`;
      assert.equal(resolveTournamentSource({ name: `2026 OWCS ${region}赛区第${stage}阶段` }), `${root}Overwatch_Champions_Series/2026/${suffix}`);
    }
  }
});
test('international event identities and World Cup stages resolve to their tournament source', () => {
  assert.equal(resolveTournamentSource({ externalEventName: 'OWCSCC2026' }), `${root}Overwatch_Champions_Series/2026/Champions_Clash`);
  assert.equal(resolveTournamentSource({ externalEventName: 'MSC2026' }), `${root}Overwatch_Champions_Series/2026/Midseason_Championship`);
  for (const stage of ['小组赛', '季后赛']) assert.equal(resolveTournamentSource({ name: `2026 守望先锋世界杯 ${stage}` }), `${root}Overwatch_World_Cup/2026`);
});
test('manual source wins, unknown or similar names are not guessed, unsafe config cannot fall through', () => {
  assert.equal(resolveTournamentSource({ name: '2026 OWCS 国服赛区第一阶段' }, { liquipediaTournamentUrl: `${root}Custom_Tournament` }), `${root}Custom_Tournament`);
  for (const name of ['2026 OWCS 国服赛区第一阶段 预选赛', '2026 OWCS 未知赛区第一阶段', '某个比赛']) assert.equal(resolveTournamentSource({ name }, null), null);
  assert.throws(() => resolveTournamentSource({ name: '2026 OWCS 国服赛区第一阶段' }, { liquipediaTournamentUrl: 'http://127.0.0.1/private' }));
});

test('shared seasons require the exact resolved article, honoring overrides and excluding sibling qualifiers', () => {
  const seasons = [
    { id: 24, name: '2026 守望先锋世界杯 小组赛' },
    { id: 25, name: '2026 守望先锋世界杯 季后赛' },
    { id: 26, name: '2025 守望先锋世界杯 小组赛' },
    ...[27, 28, 29, 30, 31].map(id => ({ id, name: 'Manual' }))
  ];
  const configs = [
    { key: 'visualize_season_27', value: JSON.stringify({ liquipediaTournamentUrl: `${root}index.php?title=Overwatch_World_Cup/2026` }) },
    { key: 'visualize_season_28', value: { liquipediaTournamentUrl: `${root}Overwatch_World_Cup/2026/Open_Qualifier` } },
    { key: 'visualize_season_29', value: { liquipediaTournamentUrl: `${root}Overwatch_World_Cup/2026/Regular_Season` } },
    { key: 'visualize_season_30', value: '{broken' },
    { key: 'visualize_season_31', value: { liquipediaTournamentUrl: 'https://example.com/private' } }
  ];
  const source = `${root}Overwatch_World_Cup/2026`;
  assert.deepEqual(resolveTournamentSeasonIds(source, seasons, configs), [24, 25, 27]);
  assert.deepEqual(resolveTournamentSeasonIds(`${source}/Regular_Season`, seasons, configs), [29]);
  configs.push({ key: 'visualize_season_25', value: { liquipediaTournamentUrl: `${source}/Playoffs` } });
  assert.deepEqual(resolveTournamentSeasonIds(source, seasons, configs), [24, 27]);
});
