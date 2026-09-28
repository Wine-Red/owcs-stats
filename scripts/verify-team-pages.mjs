// Real local preview for brackets; intercepted admin writes exercise the form
// without changing any business data. Database persistence has separate tests.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { launchBrowser } from './lib/browser.mjs';
const require = createRequire(import.meta.url);
const { teamLiquipediaPayload, serializeTeamLiquipedia } = require('../backend/services/TeamLiquipediaLink');
const base = process.env.TOURNAMENT_PREVIEW_URL || 'http://127.0.0.1:8083';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only local preview is permitted');
const output = '.local/tournament-qa';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const report = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/visualize?seasonId=23&tab=overview`);
  const agMatches = page.locator('.tournament-board a.tournament-match').filter({ has: page.locator('.team-name', { hasText: /^AG\.AL$/ }) });
  await agMatches.first().waitFor();
  assert.equal(await agMatches.count(), 2);
  const matchIds = await agMatches.evaluateAll(nodes => nodes.map(node => new URL(node.href).searchParams.get('matchId')).sort());
  assert.deepEqual(matchIds, ['5393', '5401']);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await agMatches.locator('.opponent').filter({ has: page.locator('.team-name', { hasText: /^AG\.AL$/ }) }).locator('img').evaluateAll(images => images.length === 2 && images.every(img => img.complete && img.naturalWidth > 0)));
    await agMatches.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/paris-team-pages-${width}.png` });
  }
  await agMatches.first().click();
  await page.waitForURL(/match-detail\?.*matchId=5393/);
  report.push({ check: 'Real Paris preview: both AG.AL games have the local logo and links', matchIds });

  let teams = await (await fetch(`${base}/api/teams`)).json();
  const original = structuredClone(teams.find(team => team.id === 2));
  // Start with a legacy response to verify that old saved links appear in the new editor.
  delete teams.find(team => team.id === 2).liquipediaUrls;
  const writes = [];
  await page.route('**/api/teams', route => route.fulfill({ json: teams }));
  await page.route('**/api/teams/2', async route => {
    assert.equal(route.request().method(), 'PUT');
    const body = route.request().postDataJSON();
    writes.push(body);
    assert.equal(Object.hasOwn(body, 'liquipediaUrl'), false);
    const previous = teams.find(team => team.id === 2);
    const changed = serializeTeamLiquipedia({ ...previous, ...body, ...teamLiquipediaPayload(body, previous) });
    teams = teams.map(team => team.id === 2 ? changed : team);
    await route.fulfill({ json: changed });
  });
  await page.goto(`${base}/data-manage/teams`);
  const card = page.locator('.team-card').filter({ has: page.locator('.entity-card-heading strong', { hasText: /^AG\.AL$/ }) });
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑队伍' });
  await dialog.waitFor();
  assert.equal(await dialog.locator('.team-page-row').count(), 1);
  assert.equal(await dialog.getByRole('textbox', { name: 'Liquipedia 页面 1', exact: true }).inputValue(), original.liquipediaUrl);
  await dialog.getByRole('button', { name: '添加页面', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Liquipedia 页面 2', exact: true }).fill(original.liquipediaUrls[1]);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(writes.at(-1).liquipediaUrls, original.liquipediaUrls);
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await dialog.locator('.team-page-row').count(), 2);
  await dialog.getByRole('button', { name: '删除 Liquipedia 页面 2', exact: true }).click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(writes.at(-1).liquipediaUrls, [original.liquipediaUrl]);
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  await dialog.getByRole('button', { name: '删除 Liquipedia 页面 1', exact: true }).click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(writes.at(-1).liquipediaUrls, []);
  teams = teams.map(team => team.id === 2 ? original : team);
  await page.reload();
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await dialog.locator('.team-page-editor').scrollIntoViewIfNeeded();
    assert.ok(await dialog.locator('.team-page-editor').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: `${output}/team-pages-admin-${width}.png` });
  }
  report.push({ check: 'Admin form (intercepted writes): legacy loading, add/save/reopen, remove, clear all, mobile layout', writes: writes.length });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(`${output}/team-pages-browser.json`, JSON.stringify({ report, errors }, null, 2));
  await browser.close();
}
