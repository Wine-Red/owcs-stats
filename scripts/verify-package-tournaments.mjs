// Verify real saved tournament data in the delivered HTML, including hash routes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from './lib/browser.mjs';
import { openDisplayPackage } from './lib/display-package.mjs';
import { readStaticData } from '../src/services/staticSnapshot.mjs';
import { fulfillInteractionRead } from './lib/interaction-read-fixtures.mjs';

const live = process.argv.includes('--api');
const directory = live ? 'dist-api' : 'dist';
const base = process.env.OWCS_STATIC_PREVIEW_URL || `http://127.0.0.1:${live ? 4175 : 4174}/partner/owcs/`;
const config = live ? JSON.parse(await readFile(`${directory}/site-config.json`, 'utf8')) : null;
const bundle = live ? null : await openDisplayPackage(directory);
const manifest = bundle?.json('static-data/manifest.json');
// Traversing every season and match detail can exceed the public 240/min limit.
// Pace the real requests; keep the production limit and error checks intact.
let nextReadAt = 0;
const paceApiRead = async () => {
  const at = Math.max(Date.now(), nextReadAt);
  nextReadAt = at + 350;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, at - Date.now())));
};
const get = async (route, params = {}) => {
  if (!live) return readStaticData(name => bundle.json(`static-data/${manifest.files[name].path}`), route, params);
  await paceApiRead();
  const response = await fetch(`${config.apiBaseUrl}${route}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, route);
  return response.json();
};
const seasons = await get('/seasons');
const result = await get('/matches', { pageSize: 10000 });
const matches = new Map((Array.isArray(result) ? result : result.list).map(match => [String(match.id), match]));
const saved = [];
for (const season of seasons) {
  const tournament = await get(`/seasons/${season.id}/tournament`);
  if (tournament.blocks?.length) saved.push({ season, tournament });
}
const browser = await launchBrowser();
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], forbidden = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.route('**/*', async route => {
      if (live && await fulfillInteractionRead(route, config)) return;
      const url = new URL(route.request().url());
      if (!/^https?:$/.test(url.protocol) || url.origin === new URL(base).origin) return route.continue();
      if (live && url.href.startsWith(`${config.apiBaseUrl}/`)) { await paceApiRead(); return route.continue(); }
      if (live && url.origin === config.mediaOrigin && url.pathname.startsWith('/media/')) return route.continue();
      forbidden.push(url.href); return route.abort();
    });
    let stageCount = 0, linkCount = 0, detailCount = 0;
    for (const { season } of saved) {
      await page.goto(`${base}#/visualize?seasonId=${season.id}&tab=overview`, { waitUntil: 'domcontentloaded' });
      await page.locator('.tournament-block').first().waitFor({ timeout: 60000 }).catch(error => {
        throw new Error(`Season ${season.id} at ${width}px failed: ${error.message}; HTTP/script errors: ${JSON.stringify(errors)}`);
      });
      const tabs = page.locator('#tournament-stage-tabs-host').getByRole('tab');
      const count = await tabs.count();
      let detailUrl;
      for (let index = 0; index < Math.max(1, count); index++) {
        if (count) await tabs.nth(index).click();
        await page.locator('.tournament-block').first().waitFor({ timeout: 10000 });
        assert.equal(await page.locator('.tournament-empty').count(), 0);
        const links = await page.locator('.tournament-board a[href*="match-detail"]').evaluateAll(nodes => nodes.map(node => node.href));
        for (const link of links) {
          const query = new URL(new URL(link).hash.slice(1), 'https://package.invalid').searchParams;
          const match = matches.get(query.get('matchId'));
          assert.ok(match, `Tournament link references missing match: ${link}`);
          assert.equal(query.get('seasonId'), String(match.seasonId), `Wrong season in tournament link: ${link}`);
        }
        detailUrl ||= links[0];
        linkCount += links.length; stageCount++;
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${season.name} overflow at ${width}px`);
      }
      if (detailUrl) {
        await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
        await page.locator('.match-detail-page .detail-container').waitFor({ timeout: 60000 });
        detailCount++;
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(forbidden, []);
    console.log(`[package-tournaments] PASS ${live ? 'API' : 'snapshot'} ${width}px: ${saved.length} saved tournaments, ${stageCount} stages, ${linkCount} verified links, ${detailCount} match pages`);
    await page.close();
  }
} finally { await browser.close(); }
