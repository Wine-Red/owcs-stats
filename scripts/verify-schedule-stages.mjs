import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './lib/browser.mjs';

const base = process.env.TOURNAMENT_PREVIEW_URL || 'http://127.0.0.1:8083';
const output = '.local/tournament-qa';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const report = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  let tickerReads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/matches/upcoming')) tickerReads++; });
  const seasons = await page.request.get(`${base}/api/seasons`).then(response => response.json());
  const expectedStages = {
    12: ['双败淘汰赛'], 13: ['瑞士轮', '循环赛', '季后赛'], 20: ['常规赛', '季后赛'], 22: ['常规赛', '季后赛'],
    14: ['常规赛', '季后赛种子决定战', '最后机会资格赛', '季后赛'],
    23: ['小组赛', '季后赛'], 24: ['小组赛'], 25: ['季后赛']
  };
  const openSeason = async id => {
    const metadata = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/seasons/${id}/tournament`));
    await page.goto(`${base}/visualize?seasonId=${id}&tab=recent`);
    await page.locator('.schedule-shell .schedule-match').first().waitFor();
    const response = await metadata;
    await response.finished();
    await page.locator('.date-chip--all').click();
    const matchCount = await page.locator('.schedule-shell .schedule-match').count();
    await page.getByRole('button', { name: '查看全部比赛日' }).click();
    await page.waitForFunction(() => {
      const drawer = document.querySelector('.schedule-date-drawer');
      return drawer && Math.abs(drawer.getBoundingClientRect().bottom - innerHeight) < 2;
    });
    return { response, matchCount };
  };
  const readGroups = () => page.locator('.date-picker-group').evaluateAll(groups => groups.map(group => ({
    label: group.querySelector('h3 > span').textContent.trim(),
    range: group.querySelector('.date-picker-range').textContent.trim(),
    dates: [...group.querySelectorAll('.date-picker-option')].map(button => button.getAttribute('aria-label').split('，')[0])
  })));
  for (const season of seasons.filter(season => season.status === 'completed')) {
    console.log(`Checking completed season ${season.id}: ${season.name}`);
    const { response, matchCount } = await openSeason(season.id);
    assert.ok(response.ok(), `Source metadata for completed season ${season.id}`);
    const groups = await readGroups();
    const headings = groups.map(group => group.label).join(' | ');
    for (const stage of expectedStages[season.id] || []) assert.ok(headings.includes(stage), `${season.name}: missing ${stage}: ${headings}`);
    const dates = groups.flatMap(group => group.dates);
    assert.equal(new Set(dates).size, dates.length, `Duplicate dates: ${season.name}`);
    assert.equal(dates.length, await page.locator('.date-chip:not(.date-chip--all)').count(), `Missing dates: ${season.name}`);
    assert.equal(await page.locator('.schedule-match.is-upcoming').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if ([12, 13, 14, 20, 25].includes(season.id)) await page.screenshot({ path: `${output}/schedule-stages-${season.id}.png` });
    report.push({ id: season.id, name: season.name, matchCount, groups });
    console.log(JSON.stringify({ id: season.id, groups: groups.map(group => group.label), dates: dates.length, matchCount }));
  }
  assert.equal(tickerReads, 0, 'Completed seasons must not request the upcoming ticker');

  // A metadata failure must leave recorded matches/dates available.
  await page.route('**/seasons/13/tournament', route => route.fulfill({ status: 503, json: { error: 'Browser-only unavailable metadata fixture' } }));
  const failed = await openSeason(13);
  assert.equal(failed.response.status(), 503);
  const fallbackGroups = await readGroups();
  assert.equal(failed.matchCount, report.find(item => item.id === 13).matchCount);
  assert.equal(fallbackGroups.flatMap(group => group.dates).length, report.find(item => item.id === 13).groups.flatMap(group => group.dates).length);
  assert.ok(fallbackGroups.every(group => group.label === '比赛周' || group.label === '时间待定'));
  assert.deepEqual(errors, []);
  await writeFile(`${output}/schedule-stages-report.json`, JSON.stringify({ report, tickerReads, fallbackPreserved: true, errors }, null, 2));
  console.log(JSON.stringify({ passed: report.length, tickerReads, fallbackPreserved: true, errors }));
} catch (error) {
  console.error(error);
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    console.error(`Failed page: ${page.url()}`);
    await page.screenshot({ path: `${output}/schedule-stages-failure.png`, timeout: 10000 }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
