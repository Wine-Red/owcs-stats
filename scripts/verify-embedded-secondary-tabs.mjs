import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser } from './lib/browser.mjs';

const base = process.env.TOURNAMENT_PREVIEW_URL || 'http://127.0.0.1:8083';
const output = '.local/tournament-qa';
await mkdir(output, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({
  viewport: { width: 390, height: 520 },
  hasTouch: true,
  isMobile: true,
  reducedMotion: 'reduce',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; OWCS App Build/1; wv) AppleWebKit/537.36 Version/4.0 Chrome/126.0 Mobile Safari/537.36'
});

const measure = selector => page.evaluate(selector => {
  const secondary = document.querySelector(selector);
  const primary = document.querySelector('.vis-tabs-container');
  const content = document.querySelector('.tab-content');
  const rect = element => element.getBoundingClientRect();
  return {
    embedded: document.documentElement.classList.contains('is-embedded-webview'),
    scrollTop: document.scrollingElement.scrollTop,
    scrollMaximum: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight,
    secondaryTop: rect(secondary).top,
    secondaryBottom: rect(secondary).bottom,
    primaryBottom: rect(primary).bottom,
    contentTop: rect(content).top,
    secondaryPosition: getComputedStyle(secondary).position,
    contentOverflow: getComputedStyle(content).overflowY,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
  };
}, selector);

const checkPinned = async (tab, selector, screenshot) => {
  await page.goto(`${base}/visualize?seasonId=28&tab=${tab}`);
  await page.locator(selector).waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(500); // Initial data load can reset restored WebView scroll.
  await page.evaluate(() => window.scrollTo(0, 0));
  const before = await measure(selector);
  assert.equal(before.embedded, true);
  assert.equal(before.secondaryPosition, 'fixed');
  assert.equal(before.contentOverflow, 'visible');
  assert.equal(before.horizontalOverflow, false);
  assert.ok(Math.abs(before.secondaryTop - before.primaryBottom) <= 1, JSON.stringify(before));
  assert.ok(Math.abs(before.contentTop - before.secondaryBottom) <= 1, JSON.stringify(before));
  assert.ok(before.scrollMaximum > 20, JSON.stringify(before));

  // This is the scroll path used by the host WebView, unlike normal browser mode.
  await page.evaluate(() => window.scrollTo(0, 200));
  const after = await measure(selector);
  assert.ok(after.scrollTop > before.scrollTop, JSON.stringify({ before, after }));
  assert.ok(after.contentTop < before.contentTop - 10, JSON.stringify({ before, after }));
  assert.ok(Math.abs(after.secondaryTop - before.secondaryTop) <= 1, JSON.stringify({ before, after }));
  assert.ok(Math.abs(after.primaryBottom - before.primaryBottom) <= 1, JSON.stringify({ before, after }));
  await page.screenshot({ path: `${output}/${screenshot}`, animations: 'disabled' });
  return { tab, before, after };
};

try {
  const stats = await checkPinned('stats', '.stats-category-choices', 'embedded-stats-secondary-scroll.png');
  await page.locator('.stats-category-choices').getByRole('radio', { name: '选手' }).click();
  assert.equal(await page.locator('.stats-category-choices').getByRole('radio', { name: '选手' }).getAttribute('aria-checked'), 'true');
  assert.ok(Math.abs((await measure('.stats-category-choices')).secondaryTop - stats.before.secondaryTop) <= 1);

  const overview = await checkPinned('overview', '#tournament-stage-tabs-host .tournament-tabs', 'embedded-stage-secondary-scroll.png');
  await page.evaluate(() => window.scrollTo(0, 0));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 430 }] });
  for (const y of [390, 350, 310, 270, 230, 190]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  const afterTouch = await measure('#tournament-stage-tabs-host .tournament-tabs');
  assert.ok(afterTouch.scrollTop > 0, JSON.stringify(afterTouch));
  assert.ok(Math.abs(afterTouch.secondaryTop - overview.before.secondaryTop) <= 1, JSON.stringify(afterTouch));
  const seedStage = page.locator('#tournament-stage-tabs-host').getByRole('tab', { name: /种子决定战/ });
  await seedStage.click();
  assert.equal(await seedStage.getAttribute('aria-selected'), 'true');
  assert.ok(Math.abs((await measure('#tournament-stage-tabs-host .tournament-tabs')).secondaryTop - overview.before.secondaryTop) <= 1);
  console.log(JSON.stringify({ stats, overview, afterTouch }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
