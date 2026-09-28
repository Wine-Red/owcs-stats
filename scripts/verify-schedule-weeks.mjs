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
  await page.addInitScript(() => sessionStorage.removeItem('liquipedia_upcoming_matches'));
  const read = async path => {
    const response = await page.request.get(`${base}/api${path}`);
    assert.ok(response.ok());
    return response.json();
  };
  const [snapshot, upcoming] = await Promise.all([read('/seasons/28/tournament'), read('/matches/upcoming')]);
  const source = snapshot.blocks.find(block => block.sourceTitle === 'Week 1');
  const first = upcoming.data.find(match => match.link?.startsWith(source.sourceUrl));
  assert.ok(first);
  const openPicker = async () => {
    await page.goto(`${base}/visualize?seasonId=28&tab=recent`);
    await page.locator('.schedule-shell .schedule-match.is-upcoming').first().waitFor();
    await page.getByRole('button', { name: '查看全部比赛日' }).click();
    await page.locator('.date-picker-group').first().waitFor();
    await page.waitForFunction(() => {
      const drawer = document.querySelector('.schedule-date-drawer');
      return drawer && Math.abs(drawer.getBoundingClientRect().bottom - innerHeight) < 2;
    });
  };
  const readGroups = () => page.locator('.date-picker-group').evaluateAll(groups => groups.map(group => ({
    heading: group.querySelector('h3').innerText,
    dates: [...group.querySelectorAll('.date-picker-option')].map(button => button.getAttribute('aria-label').split('，')[0])
  })));
  await openPicker();
  const realGroups = await readGroups();
  assert.deepEqual(realGroups.map(group => group.dates), [
    ['2026-10-02', '2026-10-03', '2026-10-04'],
    ['2026-10-09', '2026-10-10', '2026-10-11'],
    ['2026-10-16', '2026-10-17', '2026-10-18']
  ]);
  assert.ok(realGroups.every((group, index) => group.heading.includes(`第 ${index + 1} 周`)));
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await page.locator('.date-picker-option').evaluateAll(buttons => buttons.every(button => {
      const rect = button.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44 && button.scrollWidth <= button.clientWidth + 2;
    })));
    await page.screenshot({ path: `${output}/schedule-weeks-${width}.png` });
  }
  report.push({ check: 'Real Korean schedule follows source weeks at 320/390px', groups: realGroups });

  // Browser-only response fixtures; no configuration or match data is written.
  const firstWeek = ['2026-10-31', '2026-11-01', '2026-11-02'];
  const secondWeek = ['2026-11-06', '2026-11-07', '2026-11-09'];
  const fixtureDays = [...firstWeek, ...secondWeek];
  const time = date => Date.parse(`${date}T02:00:00+08:00`);
  let officialWeeks = true;
  await page.route('**/seasons/28/tournament', route => route.fulfill({ json: {
    ...snapshot, blocks: officialWeeks ? [firstWeek, secondWeek].map((days, index) => ({
      ...source, id: `fixture-week-${index}`, sourceTitle: `Week ${index + 4}`,
      sourceHeadings: ['Matches', `Week ${index + 4}`], title: `第 ${index + 4} 周`,
      matches: days.map((date, matchIndex) => ({ ...source.matches[0], id: `${index}-${matchIndex}`, timestamp: time(date) }))
    })) : []
  } }));
  await page.route('**/matches/upcoming', route => route.fulfill({ json: {
    ...upcoming, data: fixtureDays.map((date, index) => ({ ...first,
      sourceId: `fixture-${index}`, timestamp: time(date),
      link: `${source.sourceUrl}${officialWeeks ? `#Week_${index < 3 ? 4 : 5}` : ''}`
    }))
  } }));
  await openPicker();
  const crossMonth = await readGroups();
  assert.deepEqual(crossMonth.map(group => group.dates), [firstWeek, secondWeek]);
  assert.ok(crossMonth[0].heading.includes('10.31 – 11.02'));
  assert.ok(await page.getByRole('button', { name: '2026-11-02，1 场比赛', exact: true }).innerText().then(text => text.includes('11月02日')));
  await page.screenshot({ path: `${output}/schedule-weeks-cross-month.png` });
  await page.getByRole('button', { name: '2026-11-02，1 场比赛', exact: true }).click();
  await page.locator('.schedule-date-drawer').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.schedule-shell .schedule-match').count(), 1);
  assert.equal(await page.locator('.date-chip.active .date-chip-main').innerText(), '11/02');
  await page.locator('.schedule-shell .schedule-match .match-main').click();
  await page.waitForURL(/\/visualize\/upcoming-match\?/);
  assert.equal(Number(new URL(page.url()).searchParams.get('time')), time('2026-11-02'));
  report.push({ check: 'Sunday UTC becomes Monday locally, stays in the source week across a month boundary, and selects the correct preview', groups: crossMonth });

  officialWeeks = false;
  await openPicker();
  const inferred = await readGroups();
  assert.deepEqual(inferred.map(group => group.dates), [firstWeek, secondWeek]);
  assert.ok(inferred.every(group => group.heading.startsWith('比赛周')));
  report.push({ check: 'Unlabelled dates group by event days and rest gaps, including Monday', groups: inferred });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/schedule-weeks-report.json`, JSON.stringify({ report, errors }, null, 2));
  console.log(JSON.stringify({ report, errors }, null, 2));
} finally {
  await browser.close();
}
