import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './lib/browser.mjs';

const base = process.env.TOURNAMENT_PREVIEW_URL || 'http://127.0.0.1:8083';
const output = '.local/tournament-qa';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const report = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  const read = async route => {
    const response = await page.request.get(`${base}/api${route}`);
    assert.ok(response.ok(), route);
    return response.json();
  };
  const [config, snapshot, upcoming] = await Promise.all([
    read('/config/visualize_season_28'), read('/seasons/28/tournament'), read('/matches/upcoming')
  ]);
  const root = 'https://liquipedia.net/overwatch/Overwatch_Champions_Series/2026/Asia/Stage_3/Korea';
  assert.equal(snapshot.sourceUrl, root);
  assert.ok(snapshot.sources.some(source => source.url === `${root}/Regular_Season`));
  const expected = upcoming.data.filter(match => match.link.split('#')[0] === `${root}/Regular_Season`);
  assert.ok(expected.length > 0);
  const schedule = page.locator('.schedule-shell');
  const showAll = async () => {
    await schedule.locator('.schedule-match.is-upcoming').first().waitFor();
    await schedule.locator('.date-chip--all').click();
    assert.equal(await schedule.locator('.schedule-match.is-upcoming').count(), expected.length);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  };
  await page.goto(`${base}/visualize?seasonId=28&tab=recent`);
  await showAll();
  await page.screenshot({ path: `${output}/korea-upcoming-schedule-mobile.png` });
  report.push({ check: 'Real Korean schedule with existing season config', manualUrl: config.liquipediaTournamentUrl, count: expected.length });
  const first = expected[0];
  await schedule.locator('.schedule-match.is-upcoming .match-main').first().click();
  await page.waitForURL(/\/visualize\/upcoming-match\?/);
  const query = new URL(page.url()).searchParams;
  assert.equal(query.get('seasonId'), '28');
  assert.equal(Number(query.get('time')), first.timestamp);
  assert.equal(query.get('t1'), first.team1.name);
  assert.equal(query.get('t2'), first.team2.name);
  await page.locator('.upcoming-detail-page .match-banner').waitFor({ timeout: 60000 });
  assert.deepEqual(await page.locator('.match-banner .team-name').allTextContents(), [first.team1.name, first.team2.name]);
  await page.locator('.match-banner .left-team').click();
  await page.waitForURL(/\/visualize\/team-detail\?/);
  assert.equal(new URL(page.url()).searchParams.get('teamId'), '25'); // CB's verified local identity.
  report.push({ check: 'Real preview opens with correct season, date, teams and team-detail identity', teams: [first.team1.name, first.team2.name], passed: true });

  let emptyConfigReads = 0, manualConfigReads = 0, injectedScheduleReads = 0;
  await page.route('**/config/visualize_season_28', route => { emptyConfigReads++; return route.fulfill({ json: { ...config, liquipediaTournamentUrl: '' } }); });
  await page.goto(`${base}/visualize?seasonId=28&tab=recent`);
  await showAll();
  assert.ok(emptyConfigReads > 0);
  report.push({ check: 'Empty manual source config still uses the tournament API resolved source and its regular-season page', passed: true });

  // Read-only browser fixtures: prove that filling the root URL also works and
  // that sibling qualifier / other-region ticker entries remain excluded.
  await page.route('**/config/visualize_season_28', route => { manualConfigReads++; return route.fulfill({ json: { ...config, liquipediaTournamentUrl: root } }); });
  await page.route('**/matches/upcoming', route => { injectedScheduleReads++; return route.fulfill({ json: {
    ...upcoming, data: [...upcoming.data,
      { ...first, link: `${root}/Open_Qualifier`, tournamentName: 'Excluded qualifier' },
      { ...first, link: `${root}/Unconfirmed`, tournamentName: 'Excluded unknown page' },
      { ...first, link: `${root.replace('/Korea', '/Japan')}/Regular_Season`, tournamentName: 'Other region' }
    ]
  } }); });
  await page.evaluate(() => sessionStorage.removeItem('liquipedia_upcoming_matches'));
  await page.goto(`${base}/visualize?seasonId=28&tab=recent`);
  await showAll();
  assert.ok(manualConfigReads > 0 && injectedScheduleReads > 0);
  report.push({ check: 'Manual root URL includes confirmed regular-season page and excludes sibling qualifier, unknown child and other region', passed: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(`${output}/upcoming-schedule-report.json`, JSON.stringify({ report, errors }, null, 2));
  await browser.close();
}
