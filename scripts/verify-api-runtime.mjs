// Real browser CORS/media plus controlled response changes. Never writes source data.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { launchBrowser } from './lib/browser.mjs';
const base = process.env.OWCS_STATIC_PREVIEW_URL || 'http://127.0.0.1:4175/partner/owcs/';
const config = JSON.parse(await readFile('dist-api/site-config.json', 'utf8'));
const get = async path => (await fetch(`${config.apiBaseUrl}${path}`)).json();
const teams = await get('/teams'), relations = await get('/season-teams');
const selected = relations.find(row => teams.some(team => team.id === row.teamId && team.logo));
assert.ok(selected);
const team = teams.find(row => row.id === selected.teamId);
const hash = `#/visualize/team-detail?seasonId=${selected.seasonId}&teamId=${team.id}`;
const browser = await launchBrowser();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [], forbidden = [], failures = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
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

  let changed = false;
  await page.route(`${config.apiBaseUrl}/meta`, async route => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: { ...body, revision: changed ? 'fixture-new-revision' : body.revision } });
  });
  changed = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.getByRole('button', { name: '刷新数据', exact: true }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: '.local/api-runtime-qa/update-mobile.png', fullPage: true });
  let refreshed = 0;
  await page.route(`${config.apiBaseUrl}/teams`, async route => {
    refreshed++; const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: body.map(row => row.id === team.id ? { ...row, name: `${team.name} QA` } : row) });
  });
  await page.getByRole('button', { name: '刷新数据', exact: true }).click();
  await page.getByText(`${team.name} QA`, { exact: true }).first().waitFor({ timeout: 60000 });
  assert.ok(refreshed > 0, 'refresh must reload base store as well as page data');
  assert.ok(page.url().endsWith(hash), 'refresh must retain the current entity/season route');
  await page.waitForLoadState('networkidle');

  await page.unroute(`${config.apiBaseUrl}/meta`);
  injectingFailure = true;
  await context.setOffline(true);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.getByRole('button', { name: '重试', exact: true }).waitFor({ timeout: 10000 });
  assert.ok(await page.getByText(`${team.name} QA`, { exact: true }).count(), 'keep visible data during outage');
  await page.screenshot({ path: '.local/api-runtime-qa/offline-mobile.png', fullPage: true });
  await context.setOffline(false);
  // The online listener can recover metadata before a click. The changed test
  // revision then leaves the refresh action, which must work just like retry.
  await page.locator('.site-data-status button').click();
  await page.waitForLoadState('networkidle');
  await page.locator('.site-data-status').waitFor({ state: 'detached', timeout: 60000 });
  await page.unroute(`${config.apiBaseUrl}/teams`);
  await page.route(`${config.apiBaseUrl}/teams`, route => route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '{"error":"fixture outage"}' }));
  await page.reload();
  await page.getByRole('button', { name: '重试', exact: true }).waitFor({ timeout: 10000 });
  await page.unroute(`${config.apiBaseUrl}/teams`);
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.locator('.team-detail-page .detail-container').waitFor({ timeout: 60000 });
  await page.locator('.site-data-status').waitFor({ state: 'detached', timeout: 60000 });
  await page.waitForLoadState('networkidle');
  injectingFailure = false;
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); assert.deepEqual(failures, []);
  console.log('API browser runtime passed: desktop/mobile, direct/refresh, real CORS preflight, media/canvas, data update, offline/retry, no voting or admin requests');
} finally { await browser.close(); }
