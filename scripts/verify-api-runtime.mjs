// Real browser CORS/media plus controlled response changes. Never writes source data.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { launchBrowser } from './lib/browser.mjs';
const base = process.env.OWCS_STATIC_PREVIEW_URL || 'http://127.0.0.1:4175/partner/owcs/';
const config = JSON.parse(await readFile('dist-api/site-config.json', 'utf8'));
const get = async path => {
  const response = await fetch(`${config.apiBaseUrl}${path}`, { signal: AbortSignal.timeout(90000) });
  assert.equal(response.status, 200, path);
  return response.json();
};
const teams = await get('/teams'), relations = await get('/season-teams'), seasons = await get('/seasons');
const selected = relations.find(row => teams.some(team => team.id === row.teamId && team.logo));
assert.ok(selected);
const team = teams.find(row => row.id === selected.teamId);
const season = seasons.find(row => row.id === selected.seasonId);
const hash = `#/visualize/team-detail?seasonId=${selected.seasonId}&teamId=${team.id}`;
const browser = await launchBrowser();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [], forbidden = [], failures = [];
let apiReads = 0, documents = 0;
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (url.href.startsWith(`${config.apiBaseUrl}/`)) apiReads++;
  if (request.resourceType() === 'document') documents++;
  if (/\/poll-api\//.test(url.pathname) || (/\/(?:api|public-api)\//.test(url.pathname) && !url.href.startsWith(`${config.apiBaseUrl}/`))) forbidden.push(url.href);
});
let injectingFailure = false;
page.on('requestfailed', request => { if (!injectingFailure) failures.push(`${request.url()} ${request.failure()?.errorText}`); });
await mkdir('.local/api-runtime-qa', { recursive: true });
try {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}${hash}`);
    await page.locator('.team-detail-page .detail-container').waitFor({ timeout: 60000 });
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.match-support').count(), 0);
    assert.equal(await page.locator('.site-data-status').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.reload();
    await page.locator('.team-logo-large').waitFor({ timeout: 60000 });
    await page.waitForLoadState('networkidle');
    const canvas = await page.evaluate(async media => {
      const response = await fetch(media, { credentials: 'omit' });
      if (!response.ok) throw new Error(`media ${response.status}`);
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = media; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      canvas.getContext('2d').drawImage(img, 0, 0, 32, 32);
      return { width: img.naturalWidth, exported: canvas.toDataURL().startsWith('data:image/png') };
    }, new URL(team.logo, config.mediaOrigin).href);
    assert.ok(canvas.width > 0 && canvas.exported, 'cross-origin image must be readable by canvas exports');
    await page.screenshot({ path: `.local/api-runtime-qa/team-${width}.png`, fullPage: true });
  }
  const preflight = await page.evaluate(async api => {
    const response = await fetch(`${api}/seasons`, { credentials: 'omit', headers: { 'If-None-Match': '"browser-preflight-check"' } });
    return { status: response.status, etag: response.headers.get('etag'), count: (await response.json()).length };
  }, config.apiBaseUrl);
  assert.equal(preflight.status, 200); assert.ok(preflight.etag && preflight.count);

  // Backend changes must not interrupt the page. A normal browser refresh is
  // what loads the new team/season names; no update prompt or background polling.
  const mockHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  let refreshed = 0;
  await page.route(`${config.apiBaseUrl}/teams`, route => {
    refreshed++;
    return route.fulfill({ status: 200, headers: mockHeaders,
      json: teams.map(row => row.id === team.id ? { ...row, name: `${team.name} QA` } : row) });
  });
  await page.route(`${config.apiBaseUrl}/seasons`, route => route.fulfill({ status: 200, headers: mockHeaders,
    json: seasons.map(row => row.id === season.id ? { ...row, name: `${season.name} QA` } : row) }));
  const before = { apiReads, documents };
  await page.clock.install();
  await page.clock.fastForward(65000);
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
  });
  await page.waitForTimeout(500);
  assert.deepEqual({ apiReads, documents }, before, 'idle/visibility/online must not poll or reload');
  assert.equal(refreshed, 0);
  assert.equal((await page.locator('.team-name-large').textContent()).trim(), team.name);
  assert.equal(await page.locator('.site-data-status').count(), 0);
  assert.equal(await page.getByRole('button', { name: '刷新数据', exact: true }).count(), 0);

  await page.reload();
  await page.getByText(`${team.name} QA`, { exact: true }).first().waitFor({ timeout: 60000 });
  await page.locator('.season-dropdown-link .text').filter({ hasText: `${season.name} QA` }).waitFor({ timeout: 60000 });
  await page.waitForLoadState('networkidle');
  assert.equal(refreshed, 1, 'browser refresh must fetch current base data');
  assert.ok(page.url().endsWith(hash));
  assert.equal(await page.locator('.site-data-status').count(), 0);
  await page.screenshot({ path: '.local/api-runtime-qa/refreshed-mobile.png', fullPage: true });

  injectingFailure = true;
  await context.setOffline(true);
  const otherHash = `#/visualize?seasonId=${selected.seasonId}&tab=recent`;
  await page.evaluate(hash => { window.location.hash = hash; }, otherHash);
  await page.getByRole('button', { name: '重试', exact: true }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: '.local/api-runtime-qa/offline-mobile.png', fullPage: true });
  await context.setOffline(false);
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.locator('.vis-body').waitFor({ timeout: 60000 });
  await page.locator('.site-data-status').waitFor({ state: 'detached', timeout: 60000 });
  await page.waitForLoadState('networkidle');
  await page.evaluate(hash => { window.location.hash = hash; }, hash);
  await page.locator('.team-detail-page .detail-container').waitFor({ timeout: 60000 });
  await page.waitForLoadState('networkidle');

  await page.unroute(`${config.apiBaseUrl}/teams`);
  await page.unroute(`${config.apiBaseUrl}/seasons`);
  await page.route(`${config.apiBaseUrl}/teams`, route => route.fulfill({ status: 503, headers: mockHeaders, json: { error: 'fixture outage' } }));
  await page.reload();
  await page.getByRole('button', { name: '重试', exact: true }).waitFor({ timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await page.unroute(`${config.apiBaseUrl}/teams`);
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.locator('.team-detail-page .detail-container').waitFor({ timeout: 60000 });
  await page.locator('.site-data-status').waitFor({ state: 'detached', timeout: 60000 });
  await page.waitForLoadState('networkidle');
  injectingFailure = false;
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); assert.deepEqual(failures, []);
  console.log('API browser runtime passed: desktop/mobile, real CORS/media/canvas, no update prompts/polling/auto-refresh, new team/season data after browser refresh, offline/503 retry, no voting or admin requests');

} finally {
  // Let in-flight mock responses finish before closing their page.
  await page.unrouteAll({ behavior: 'wait' });
  await browser.close();
}
