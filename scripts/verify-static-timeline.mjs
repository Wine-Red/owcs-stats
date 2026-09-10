// Synthetic timeline fixture at static file URLs; never changes packaged data.
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { openDisplayPackage, replaceDisplayResources } from './lib/display-package.mjs';
const base = process.env.OWCS_STATIC_PREVIEW_URL || 'http://127.0.0.1:4174/partner/owcs/';
const manifest = JSON.parse(await readFile('dist/static-data/manifest.json', 'utf8'));
const bundle = await openDisplayPackage('dist');
const read = async name => bundle.json(`static-data/${manifest.files[name].path}`);
const games = await read('collections.mapGames'), stats = await read('collections.playerStats');
const game = games.find(item => stats.filter(row => row.mapGameId === item.id).length >= 2);
assert.ok(game, 'timeline UI verification needs a match with player statistics');
const players = stats.filter(row => row.mapGameId === game.id).map(row => ({ playerId: String(row.playerId), name: row.player?.name, teamId: row.teamId }));
const payload = {
  schemaVersion: 2, timebase: { kind: 'round-local', resetAtRoundStart: true }, players,
  rounds: [{ roundId: 'round-1', index: 1, startMs: 0, endMs: 60000, durationMs: 60000 }],
  phases: [{ roundId: 'round-1', kind: 'gameplay', startMs: 0, endMs: 60000 }],
  events: [{ eventId: 'static-fixture-kill', roundId: 'round-1', timeMs: 12000, type: 'kill', status: 'confirmed', killerId: players[0].playerId, victimId: players[1].playerId }],
  evidence: []
};
game.timeline = { schemaVersion: 2, revision: 1 };
const timelinePath = `data/timelines.${game.id}-fixture.json`;
manifest.files[`timelines.${game.id}`] = { path: timelinePath };
const fixtureHtml = replaceDisplayResources(bundle.html, {
  'static-data/manifest.json': manifest,
  [`static-data/${manifest.files['collections.mapGames'].path}`]: games,
  [`static-data/${timelinePath}`]: { ...game.timeline, payload }
});
let executablePath;
for (const candidate of [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* try next */ }
}
assert.ok(executablePath, 'Chrome/Edge required');
const browser = await chromium.launch({ executablePath, headless: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin && /^https?:$/.test(url.protocol)) { errors.push(url.href); return route.abort(); }
      if (route.request().resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: fixtureHtml });
      errors.push(`Unexpected file request: ${url.href}`); return route.abort();
    });
    await page.goto(`${base}#/visualize/match-detail?seasonId=${game.seasonId}&matchId=${game.matchId}`);
    await page.locator('.tab-nav-item').nth(1).waitFor({ timeout: 60000 });
    await page.locator('.tab-nav-item').nth(1).click();
    // Select the fixture map even when it is not the first map in the series.
    const matchGames = games.filter(item => item.matchId === game.matchId);
    await page.locator('.tab-nav-item').nth(matchGames.findIndex(item => item.id === game.id) + 1).click();
    await page.getByRole('radio', { name: '地图分析' }).click();
    await page.locator('.last-blow-marker').first().waitFor({ timeout: 30000 });
    assert.equal(await page.locator('.last-blow-marker').count(), 1);
    assert.equal(await page.locator('.match-support').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`[static-timeline] PASS ${width}px, embedded timeline, no secondary requests`);
  }
} finally { await browser.close(); }
