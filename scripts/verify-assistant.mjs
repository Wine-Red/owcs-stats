import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './lib/browser.mjs';
const base = process.env.ASSISTANT_WEB_URL || 'http://127.0.0.1:8080';
const directory = '.local/assistant';
await mkdir(directory, { recursive: true });
const browser = await launchBrowser(), errors = [], requests = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route(/google-analytics|googletagmanager|clarity\.ms|hm\.baidu/, route => route.abort());
  // Exercise the real Vue app on real public display data. Only model output
  // is substituted for repeatable UI assertions; real-model checks are separate.
  await context.route('**/assistant/v1/chat', async route => {
    requests.push(route.request().postDataJSON());
    const events = [
      { type: 'status', text: '通过 Liquipedia 搜索，数据库中队伍 ID 为 123' },
      { type: 'text', text: '先看当前比赛的伤害对比。\n\n' },
      { type: 'text', text: '| 选手 | 伤害 |\n| --- | ---: |\n| 示例选手 | 12000 |\n\n这是界面测试数据。' },
      { type: 'sources', sources: [{ url: 'https://stats.owmini.xyz/data/v1/matches/5444', observed_at: new Date().toISOString() }] },
      { type: 'done', metrics: { total_ms: 20, first_text_ms: 1 } },
    ];
    await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: events.map(e => JSON.stringify(e)).join('\n') + '\n' });
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/visualize/match-detail?matchId=5444&seasonId=24', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '打开赛事助手' }).click();
  await page.locator('.assistant-context strong').filter({ hasText: /vs/ }).waitFor();
  await page.locator('.assistant-context small').waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: directory + '/assistant-desktop.png' });
  await page.locator('#assistant-input').fill('比较一下这场的选手');
  await page.getByRole('button', { name: '发送', exact: false }).click();
  await page.locator('.assistant-prose table').waitFor();
  assert.equal(requests[0].page.match_id, 5444);
  assert.equal(requests[0].page.competition_id, 24);
  assert.ok(requests[0].page.team_ids.length === 2);
  assert.equal(await page.locator('.assistant-sources').count(), 0, 'source metadata should not add UI clutter');
  assert.doesNotMatch(await page.locator('.assistant-message.assistant').innerText(), /Liquipedia|队伍 ID|数据来源|data\/v1/);
  await page.locator('#assistant-input').fill('换成每十分钟呢');
  await page.locator('#assistant-input').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.assistant-prose table').length === 2);
  assert.equal(requests[1].history.length, 2);
  assert.equal(requests[1].history[0].page.match_id, 5444);
  await page.locator('.tab-nav-item').nth(1).click();
  await page.locator('.assistant-context strong').filter({ hasText: /尼泊尔/ }).waitFor();
  await page.locator('#assistant-input').fill('只看当前这一局'); await page.locator('#assistant-input').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.assistant-prose table').length === 3);
  assert.ok(requests[2].page.game_id); assert.ok(requests[2].page.map_id);
  await page.locator('.assistant-context button').click();
  await page.locator('#assistant-input').fill('聊聊其他赛事'); await page.locator('#assistant-input').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.assistant-prose table').length === 4);
  assert.equal(requests[3].page.kind, 'general'); assert.equal(requests[3].page.match_id, undefined);
  await page.screenshot({ path: directory + '/assistant-answer.png' });
  await page.locator('.assistant-context button').click();
  await page.locator('.team.left-team').click();
  await page.waitForURL('**/visualize/team-detail?**', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /打开 .* 的个人页面/ }).first().waitFor({ timeout: 60000 });
  await page.locator('#assistant-input').fill('当前队伍是谁'); await page.locator('#assistant-input').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.assistant-prose table').length === 5);
  assert.equal(requests[4].page.kind, 'team'); assert.equal(requests[4].page.match_id, undefined);
  await page.getByRole('button', { name: /打开 .* 的个人页面/ }).first().click();
  await page.waitForURL('**/visualize/player-detail?**', { waitUntil: 'domcontentloaded' });
  await page.locator('.assistant-context small').waitFor({ state: 'hidden', timeout: 60000 });
  await page.locator('#assistant-input').fill('当前选手是谁'); await page.locator('#assistant-input').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.assistant-prose table').length === 6);
  assert.equal(requests[5].page.kind, 'player'); assert.equal(requests[5].page.player_ids.length, 1);
  assert.equal(requests[5].page.match_id, undefined);
  await page.getByRole('button', { name: '清空对话' }).click();
  assert.equal(await page.locator('.assistant-message').count(), 0);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: '打开赛事助手' }).click();
  assert.equal(await page.locator('.assistant-message').count(), 0, 'reload must clear chat');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.assistant-context small').waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: directory + '/assistant-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const box = await page.locator('.owcs-assistant').boundingBox(); assert.ok(box.x >= 0 && box.width <= 390 && box.y >= 0);
  await page.getByRole('button', { name: '关闭助手' }).click();
  assert.equal(await page.locator('.owcs-assistant').count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(directory + '/browser-results.json', JSON.stringify({ passed: true, checks: ['page context', 'map selection', 'followup', 'detach', 'team navigation', 'player navigation', 'clear', 'reload clears', 'Markdown table', 'source and tool metadata hidden', 'desktop', 'mobile'], errors }, null, 2));
  console.log('Assistant browser checks passed:', requests.length, 'turns; errors:', errors.length);
} finally { await browser.close(); }
