import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchBrowser } from './lib/browser.mjs';
import { apiFixture, stats, players, mapGame, timeline } from './fixtures/analytics.mjs';
import fleta from '../backend/services/FletaStatsService.js';

// Local synthetic API fixtures; no production requests or writes.
const game = { ...mapGame, team1Id: 1, team2Id: 2, seasonId: 24 };
const source = { ...timeline, players: players.map((p, i) => ({ playerId: p.name, displayName: p.name, teamSide: i < 5 ? 'A' : 'B' })),
  events: [1, 1, 1, 2, 3, 6, 6, 7, 8, 9].map((id, i) => ({ eventId: `k${i}`, type: 'kill', status: 'confirmed', killerId: players[id - 1].name, roundId: 'r1', timeMs: 1000 * i })) };
const values = fleta.calculateMapFleta(game, stats, source);
const mapStats = stats.map(row => ({ ...row, ...fleta.serializeMapFleta(values.get(row.playerId)) }));
const seasonStats = mapStats.map(row => ({ ...row, hasTimeline: true, fletaMaps: 1, teamName: row.team.name }));
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await launchBrowser();
const out = '.local/fleta-qa';
await mkdir(out, { recursive: true });
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (/^\/(api|public-api)\//.test(url.pathname)) {
        const path = url.pathname.replace(/^\/(api|public-api)/, '');
        let data;
        if (path === '/season-stats/24') data = seasonStats;
        else if (path === '/season-stats/23') data = seasonStats.map(row => ({ ...row, hasTimeline: false, fletaIndex: null }));
        else if (path === '/matches/7/map-games') data = [game, { ...game, id: 12, timeline: null }];
        else if (path === '/map-games/11/player-stats') data = mapStats;
        else if (path === '/map-games/12/player-stats') data = stats.map(row => ({ ...row, mapGameId: 12, fletaIndex: null }));
        else if (path === '/map-games/11') data = { ...game, timeline: { payload: source } };
        else data = apiFixture(path, url.searchParams);
        return route.fulfill({ json: data });
      }
      if (url.pathname.startsWith('/assistant/')) return route.fulfill({ json: { showInVisualize: false } });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await page.goto(`${base}/visualize?seasonId=24&tab=stats&statsView=player`);
    const leaderboardRows = '.player-stats-card .el-table__row, .player-stats-card .ranking-row';
    await page.locator(leaderboardRows).first().waitFor();
    assert.equal(await page.locator('.fleta-leaders, .export-btn-small, .chart-export-dialog').count(), 0);
    for (const role of ['tank', 'damage', 'support']) {
      await page.locator(`.role-radio-group input[value="${role}"]`).check({ force: true });
      await page.waitForTimeout(150);
      assert.ok(await page.locator('.leaderboard-section .fleta-value').count());
    }
    await page.locator('.role-radio-group input[value="damage"]').check({ force: true });
    await page.locator('.leaderboard-section').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/season-${width}.png` });
    assert.ok((await page.locator('.leaderboard-section').innerText()).includes('120.0'));
    assert.ok(await page.locator('.leaderboard-section').getByText('Fleta 指数', { exact: true }).count());
    await page.locator('.player-cell, .ranking-row').first().click();
    await page.locator('.benchmark-item.is-fleta').waitFor();
    await page.screenshot({ path: `${out}/player-${width}.png` });
    await page.goto(`${base}/visualize/match-detail?matchId=7&seasonId=24`);
    await page.getByRole('radiogroup', { name: '全场内容视图' }).getByRole('radio', { name: '选手总览' }).click();
    await page.locator('.overall-team-section .sp-fleta').first().waitFor();
    assert.equal(await page.locator('.overall-team-section .sp-fleta').count(), 10);
    assert.ok((await page.locator('.overall-team-section .sp-fleta strong').allTextContents()).every(value => value === '—'), 'partial map coverage must not claim a whole-match value');
    await page.locator('.tab-nav-item').nth(1).click();
    await page.getByRole('radiogroup', { name: '地图内容视图' }).getByRole('radio', { name: '选手数据' }).click();
    await page.locator('.sp-fleta:visible').first().waitFor();
    assert.equal(await page.locator('.sp-fleta:visible').count(), 10);
    assert.ok((await page.locator('.sp-fleta:visible').allInnerTexts()).join(' ').includes('120.0'));
    await page.locator('.stats-list:visible').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/map-${width}.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page must not overflow');
    await page.locator('.tab-nav-item').nth(2).click();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.sp-fleta:visible').count(), 0, 'no metric on uncovered map');
    if (width === 1440) {
      await page.goto(`${base}/visualize?seasonId=24&tab=stats&statsView=player`);
      await page.locator('.player-stats-card .el-table__row').first().waitFor();
      await page.locator('.vis-season-select').click();
      await page.locator('.stage-tab').filter({ hasText: '第二赛段' }).click();
      await page.locator('.el-select-dropdown__item').filter({ hasText: '第二赛段' }).click();
      await page.waitForFunction(() => ![...document.querySelectorAll('.el-table th')].some(el => el.textContent.includes('Fleta')));
    } else {
      await page.goto(`${base}/visualize?seasonId=23&tab=stats&statsView=player`);
    }
    await page.locator(leaderboardRows).first().waitFor();
    assert.equal(await page.locator('.fleta-leaders').count(), 0);
    assert.equal(await page.getByText('Fleta 指数', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px: all roles, compact leaderboard, player detail, map values, missing timeline hidden`);
  }
} finally {
  await browser.close();
  await server.close();
}

