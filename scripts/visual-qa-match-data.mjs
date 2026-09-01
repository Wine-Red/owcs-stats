import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const projectRoot = resolve(import.meta.dirname, '..');
const outputDirectory = join(tmpdir(), 'owcs-stats-match-data-qa');
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

async function browserPath() {
  for (const candidate of browserCandidates) {
    try { await access(candidate); return candidate; } catch { /* continue */ }
  }
  throw new Error('Edge or Chrome was not found');
}

async function freePort() {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
  return address.port;
}

const teams = [
  { id: 1, name: 'Weibo Gaming', logo: '' },
  { id: 2, name: 'JD Gaming', logo: '' }
];
const players = [
  ...['PINEAPPLE', 'KANEKI', 'BELOSREA', 'MMONK', 'MEWTWO'],
  ...['LIGE', 'ALPHARI', 'EZHAN', 'RECALL', 'LENGSA']
].map((name, index) => ({ id: index + 1, name, role: ['tank', 'damage', 'damage', 'support', 'support'][index % 5] }));
const maps = [
  { id: 1, name: '努巴尼', type: '混合地图' },
  { id: 2, name: '好莱坞', type: '混合地图' },
  { id: 3, name: '伊利奥斯', type: '控制地图' }
];
const match = {
  id: 7, externalId: 'owcs-2026-cn-s1-match-07', seasonId: 1,
  team1Id: 1, team2Id: 2, winnerId: 1, team1Score: 3, team2Score: 0,
  matchDate: '2026-09-01', boFormat: 'BO5',
  Season: { id: 1, name: 'OWCS 2026 中国赛区 第一赛季' }, team1: teams[0], team2: teams[1], winner: teams[0]
};
const heroNames = ['温斯顿', '猎空', '源氏', '安娜', '禅雅塔'];
const statsForMap = mapGameId => players.map((player, index) => ({
  id: mapGameId * 100 + index,
  mapGameId,
  playerId: player.id,
  teamId: index < 5 ? 1 : 2,
  kills: 18 - (index % 4), deaths: 6 + (index % 3), assists: 9 + index,
  damage: 10240 + index * 640, healing: player.role === 'support' ? 11900 + index * 90 : 0,
  mitigation: player.role === 'tank' ? 13800 : 0, finalBlows: 7 + (index % 5), ultsUsed: 4,
  player, team: index < 5 ? teams[0] : teams[1],
  heroStats: [{
    id: mapGameId * 1000 + index, heroName: heroNames[index % 5], usageSeconds: 540,
    usagePercentage: 100, finalBlows: 7 + (index % 5), deathsByFinalBlow: 5,
    ultReady: 5, ultUsed: 4, avgUltChargeSeconds: 78.4
  }]
}));
const mapGames = maps.map((map, index) => ({
  id: 11 + index,
  matchId: 7,
  externalRoundIndex: index,
  mapId: map.id,
  Map: map,
  winnerId: index === 1 ? 2 : 1,
  winner: index === 1 ? teams[1] : teams[0],
  team1BanHero: index === 0 ? { name: 'D.Va' } : null,
  team2BanHero: index === 0 ? { name: '安娜' } : null,
  duration: [658, 744, 615][index],
  playerStats: statsForMap(11 + index),
  timeline: index === 1 ? null : {
    schemaVersion: 2, revision: index + 1,
    digest: 'ac08201d6b4407b9914cfb762f992e1f91d57b76c20a54f4a739694fdbe906bb',
    sourceTaskId: `studio-task-${index + 1}`,
    timebase: { kind: 'round-local', nonGameplay: 'excluded', segmentJoin: 'seamless', resetAtRoundStart: true },
    rounds: [
      { roundId: 'round-1', index: 1, durationMs: 385_000 },
      { roundId: 'round-2', index: 2, durationMs: 273_000 }
    ],
    counts: { players: 10, segments: 4, rounds: 2, phases: 7, events: 186 + index * 12, evidence: 54 },
    eventTypes: { kill: 38, hero_switch: 24, ultimate_used: 31 }
  }
}));
const matchDetail = {
  match,
  summary: { mapGames: 3, totalDurationSeconds: 2017, playerStats: 30, heroStats: 30, timelineMaps: 2 },
  mapGames
};
const timelinePayload = {
  schemaVersion: 2,
  timebase: { kind: 'round-local', nonGameplay: 'excluded', segmentJoin: 'seamless', resetAtRoundStart: true },
  source: { taskId: 'studio-task-1' },
  media: { durationMs: 658_000 },
  players,
  rounds: [
    { roundId: 'round-1', index: 1, startMs: 0, endMs: 385_000, durationMs: 385_000 },
    { roundId: 'round-2', index: 2, startMs: 0, endMs: 273_000, durationMs: 273_000 }
  ],
  phases: [
    { phaseId: 'phase-1', roundId: 'round-1', kind: 'gameplay', startMs: 0, endMs: 210_000 },
    { phaseId: 'phase-2', roundId: 'round-1', kind: 'pause', startMs: 210_000, endMs: 225_000 },
    { phaseId: 'phase-3', roundId: 'round-1', kind: 'gameplay', startMs: 225_000, endMs: 385_000 },
    { phaseId: 'phase-4', roundId: 'round-2', kind: 'gameplay', startMs: 0, endMs: 273_000 }
  ],
  events: [
    { eventId: 'event-1', roundId: 'round-1', timeMs: 14_000, type: 'hero_selected', status: 'confirmed', playerId: 'PINEAPPLE', heroId: 'winston', heroName: '温斯顿' },
    { eventId: 'event-2', roundId: 'round-1', timeMs: 58_000, type: 'kill', status: 'confirmed', killerId: 'KANEKI', victimId: 'LIGE', heroName: '猎空' },
    { eventId: 'event-3', roundId: 'round-2', timeMs: 91_000, type: 'ultimate_used', status: 'confirmed', playerId: 'MMONK', heroName: '安娜' }
  ],
  evidence: []
};

const port = await freePort();
const vite = spawn(process.execPath, [join(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port)], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe']
});
let viteLog = '';
vite.stdout.on('data', chunk => { viteLog += String(chunk); });
vite.stderr.on('data', chunk => { viteLog += String(chunk); });
let browser;

async function installMocks(page) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let body = {};
    if (url.pathname === '/api/seasons') body = [{ id: 1, name: match.Season.name }];
    else if (url.pathname === '/api/teams') body = teams;
    else if (url.pathname === '/api/players') body = players;
    else if (url.pathname === '/api/maps') body = maps;
    else if (url.pathname === '/api/heroes') body = heroNames.map((name, index) => ({ id: index + 1, name, role: ['tank', 'damage', 'damage', 'support', 'support'][index] }));
    else if (url.pathname === '/api/matches') body = { total: 1, list: [match] };
    else if (url.pathname === '/api/matches/7/data') body = matchDetail;
    else if (url.pathname === '/api/map-games/11') body = { ...mapGames[0], timeline: { payload: timelinePayload } };
    else if (url.pathname === '/api/map-games/13') body = { ...mapGames[2], timeline: { payload: timelinePayload } };
    else if (url.pathname.startsWith('/api/config/')) body = {};
    else body = [];
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
  });
}

async function capture(context, output, mobile = false) {
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await installMocks(page);
  await page.goto(`http://127.0.0.1:${port}/data-manage/matches`, { waitUntil: 'networkidle' });
  try {
    await page.getByRole('button', { name: '查看比赛数据' }).click();
  } catch (error) {
    const diagnostic = join(outputDirectory, `match-data-${mobile ? 'mobile' : 'desktop'}-failure.png`);
    await page.screenshot({ path: diagnostic, fullPage: true });
    throw new Error([
      error.message,
      `URL: ${page.url()}`,
      `BODY: ${(await page.locator('body').innerText()).slice(0, 2000)}`,
      `BROWSER ERRORS: ${browserErrors.join('\n')}`,
      `SCREENSHOT: ${diagnostic}`
    ].join('\n'));
  }
  await page.getByText('选手与英雄数据').waitFor();
  await page.getByText('Studio 原始时间线').waitFor();
  await page.getByText('hero_selected').waitFor();
  await page.waitForTimeout(450);
  if (!mobile) {
    const roles = await page.locator('.player-cell small').allTextContents();
    assert.deepEqual(roles, ['坦克', '输出', '输出', '辅助', '辅助', '坦克', '输出', '输出', '辅助', '辅助']);
    const layout = await page.evaluate(() => {
      const body = document.querySelector('.match-data-drawer .el-drawer__body');
      const drawer = document.querySelector('.match-data-drawer');
      const table = document.querySelector('.player-data-table .el-table__inner-wrapper');
      const rows = [...document.querySelectorAll('.player-data-table .el-table__row')]
        .filter(row => !row.classList.contains('el-table__expanded-row'));
      const last = rows.at(-1)?.getBoundingClientRect();
      const drawerRect = drawer?.getBoundingClientRect();
      return {
        bodyFits: body ? body.scrollHeight <= body.clientHeight + 1 : false,
        bodyScrollHeight: body?.scrollHeight || 0,
        bodyClientHeight: body?.clientHeight || 0,
        drawerLeft: drawerRect?.left || 0,
        drawerRight: drawerRect?.right || 0,
        tableFits: table ? table.scrollWidth <= table.clientWidth + 1 : false,
        tableScrollWidth: table?.scrollWidth || 0,
        tableClientWidth: table?.clientWidth || 0,
        lastRowBottom: last?.bottom || Number.POSITIVE_INFINITY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    });
    assert.equal(layout.bodyFits, true, JSON.stringify(layout));
    assert.equal(layout.tableFits, true, JSON.stringify(layout));
    assert.ok(layout.drawerLeft <= layout.viewportWidth * 0.1, JSON.stringify(layout));
    assert.ok(layout.lastRowBottom <= layout.viewportHeight, JSON.stringify(layout));
    assert.equal(await page.getByRole('button', { name: '查看原始时间线' }).count(), 0);
    assert.equal(await page.locator('.timeline-round-block').count(), 2);
    assert.equal(await page.locator('.timeline-round-reset').filter({ hasText: '从 0:00 计时' }).count(), 2);
    assert.equal(await page.locator('.timeline-track i').count(), 4);
  }
  await page.screenshot({ path: output, fullPage: true });
  await page.locator('.player-data-table .el-table__expand-icon').first().click();
  await page.getByText('平均充能').first().waitFor();
  await page.getByRole('button', { name: /好莱坞/u }).click();
  await page.getByText('这张地图尚未同步 OWCS Studio 时间线。').waitFor();
  await page.getByRole('button', { name: /伊利奥斯/u }).click();
  await page.locator('.timeline-inspector-head code').filter({ hasText: 'r3' }).waitFor();
  assert.match(await page.locator('.timeline-event-row').first().innerText(), /hero_selected/u);
  await page.close();
}

try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch { /* startup */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
    if (attempt === 99) throw new Error(`Vite did not start:\n${viteLog}`);
  }
  browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  await mkdir(outputDirectory, { recursive: true });
  const desktop = join(outputDirectory, 'match-data-desktop.png');
  const mobile = join(outputDirectory, 'match-data-mobile.png');
  await capture(await browser.newContext({ viewport: { width: 1600, height: 1000 } }), desktop);
  await capture(await browser.newContext({ viewport: { width: 700, height: 1050 } }), mobile, true);
  process.stdout.write(JSON.stringify({ desktop, mobile }, null, 2) + '\n');
} finally {
  await browser?.close();
  vite.kill();
}
