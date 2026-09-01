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
  heroStats: [
    {
      id: mapGameId * 1000 + index, heroName: heroNames[index % 5], usageSeconds: 395,
      usagePercentage: 73, finalBlows: 7 + (index % 5), deathsByFinalBlow: 5,
      ultReady: 5, ultUsed: 4, avgUltChargeSeconds: 128.4
    },
    {
      id: mapGameId * 2000 + index, heroName: heroNames[(index + 1) % 5], usageSeconds: 120,
      usagePercentage: 22, finalBlows: 2, deathsByFinalBlow: 1,
      ultReady: 2, ultUsed: 1, avgUltChargeSeconds: 71.2
    },
    {
      id: mapGameId * 3000 + index, heroName: heroNames[(index + 2) % 5], usageSeconds: 60,
      usagePercentage: 11, finalBlows: 1, deathsByFinalBlow: 1,
      ultReady: 0, ultUsed: 0, avgUltChargeSeconds: null
    },
    {
      id: mapGameId * 4000 + index, heroName: heroNames[(index + 3) % 5], usageSeconds: 25,
      usagePercentage: 5, finalBlows: 0, deathsByFinalBlow: 0,
      ultReady: 0, ultUsed: 0, avgUltChargeSeconds: null
    }
  ]
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
    { phaseId: 'phase-4', roundId: 'round-2', kind: 'gameplay', startMs: 0, endMs: 130_000 },
    { phaseId: 'phase-5', roundId: 'round-2', kind: 'pause', startMs: 130_000, endMs: 145_000 },
    { phaseId: 'phase-6', roundId: 'round-2', kind: 'gameplay', startMs: 145_000, endMs: 240_000 },
    { phaseId: 'phase-7', roundId: 'round-2', kind: 'replay', startMs: 240_000, endMs: 273_000 }
  ],
  events: [
    { eventId: 'event-1', roundId: 'round-1', timeMs: 14_000, type: 'hero_selected', status: 'confirmed', playerId: 'PINEAPPLE', heroId: 'winston', heroName: '温斯顿' },
    { eventId: 'event-2', roundId: 'round-1', timeMs: 58_000, type: 'kill', status: 'confirmed', killerId: 'KANEKI', victimId: 'LIGE', heroName: '猎空' },
    { eventId: 'event-3', roundId: 'round-2', timeMs: 12_000, type: 'hero_selected', status: 'confirmed', playerId: 'ALPHARI', heroName: '源氏' },
    { eventId: 'event-4', roundId: 'round-2', timeMs: 37_000, type: 'kill', status: 'confirmed', killerId: 'EZHAN', victimId: 'BELOSREA', heroName: '猎空' },
    { eventId: 'event-5', roundId: 'round-2', timeMs: 62_000, type: 'kill', status: 'confirmed', killerId: 'PINEAPPLE', victimId: 'ALPHARI', heroName: '温斯顿' },
    { eventId: 'event-6', roundId: 'round-2', timeMs: 91_000, type: 'ultimate_used', status: 'confirmed', playerId: 'MMONK', heroName: '安娜' },
    { eventId: 'event-7', roundId: 'round-2', timeMs: 118_000, type: 'kill', status: 'confirmed', killerId: 'KANEKI', victimId: 'LIGE', heroName: '猎空' },
    { eventId: 'event-8', roundId: 'round-2', timeMs: 136_000, type: 'hero_selected', status: 'confirmed', playerId: 'LIGE', heroName: 'D.Va' },
    { eventId: 'event-9', roundId: 'round-2', timeMs: 161_000, type: 'ultimate_used', status: 'confirmed', playerId: 'RECALL', heroName: '雾子' },
    { eventId: 'event-10', roundId: 'round-2', timeMs: 189_000, type: 'kill', status: 'confirmed', killerId: 'LENGSA', victimId: 'MMONK', heroName: '卢西奥' },
    { eventId: 'event-11', roundId: 'round-2', timeMs: 214_000, type: 'death', status: 'confirmed', playerId: 'MEWTWO', heroName: '禅雅塔' },
    { eventId: 'event-12', roundId: 'round-2', timeMs: 241_000, type: 'ultimate_used', status: 'confirmed', playerId: 'LENGSA', heroName: '卢西奥' }
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
  await page.route(/\/(?:api|public-api)\//u, async route => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/public-api(?=\/)/u, '/api');
    let body = {};
    if (pathname === '/api/seasons') body = [{ id: 1, name: match.Season.name }];
    else if (pathname === '/api/teams') body = teams;
    else if (pathname === '/api/players') body = players;
    else if (pathname === '/api/maps') body = maps;
    else if (pathname === '/api/heroes') body = heroNames.map((name, index) => ({ id: index + 1, name, role: ['tank', 'damage', 'damage', 'support', 'support'][index] }));
    else if (pathname === '/api/matches') body = { total: 1, list: [match] };
    else if (pathname === '/api/matches/7') body = match;
    else if (pathname === '/api/matches/7/data') body = matchDetail;
    else if (pathname === '/api/matches/7/map-games') body = mapGames;
    else if (/^\/api\/map-games\/\d+\/player-stats$/u.test(pathname)) {
      const mapGameId = Number(pathname.split('/')[3]);
      body = statsForMap(mapGameId);
    }
    else if (pathname === '/api/map-games/11') body = { ...mapGames[0], timeline: { payload: timelinePayload } };
    else if (pathname === '/api/map-games/13') body = { ...mapGames[2], timeline: { payload: timelinePayload } };
    else if (pathname.startsWith('/api/config/')) body = {};
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
  await page.getByText('hero_selected').first().waitFor();
  await page.waitForTimeout(450);
  if (!mobile) {
    const roles = await page.locator('.player-cell small').allTextContents();
    assert.deepEqual(roles, ['坦克', '输出', '输出', '辅助', '辅助', '坦克', '输出', '输出', '辅助', '辅助']);
    const layout = await page.evaluate(() => {
      const body = document.querySelector('.match-data-drawer .el-drawer__body');
      const drawer = document.querySelector('.match-data-drawer');
      const table = document.querySelector('.player-data-table .el-table__inner-wrapper');
      const playerSection = document.querySelector('.player-data-section');
      const timeline = document.querySelector('.timeline-inspector');
      const mapTitle = document.querySelector('.map-data-titlebar');
      const rows = [...document.querySelectorAll('.player-data-table .el-table__row')]
        .filter(row => !row.classList.contains('el-table__expanded-row'));
      const last = rows.at(-1)?.getBoundingClientRect();
      const drawerRect = drawer?.getBoundingClientRect();
      const tableRect = table?.getBoundingClientRect();
      const timelineRect = timeline?.getBoundingClientRect();
      const roundRects = [...document.querySelectorAll('.timeline-round-block')].map(round => round.getBoundingClientRect());
      const eventRect = document.querySelector('.timeline-event-row')?.getBoundingClientRect();
      const bodyOverflowY = body ? getComputedStyle(body).overflowY : '';
      const isLight = element => {
        const rgb = getComputedStyle(element).backgroundColor.match(/\d+/gu)?.slice(0, 3).map(Number) || [];
        return rgb.length === 3 && rgb.reduce((sum, channel) => sum + channel, 0) / 3 > 220;
      };
      return {
        bodyScrollable: body ? body.scrollHeight > body.clientHeight + 1 : false,
        bodyOverflowY,
        bodyScrollHeight: body?.scrollHeight || 0,
        bodyClientHeight: body?.clientHeight || 0,
        drawerLeft: drawerRect?.left || 0,
        drawerRight: drawerRect?.right || 0,
        tableFits: table ? table.scrollWidth <= table.clientWidth + 1 : false,
        tableScrollWidth: table?.scrollWidth || 0,
        tableClientWidth: table?.clientWidth || 0,
        lastRowBottom: last?.bottom || Number.POSITIVE_INFINITY,
        timelineAfterPlayers: Boolean(playerSection && timeline && (playerSection.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING)),
        timelineBelowTable: Boolean(tableRect && timelineRect && timelineRect.top >= tableRect.bottom - 1),
        roundsStacked: roundRects.length > 1 && roundRects[1].top >= roundRects[0].bottom + 8,
        roundWidth: roundRects[0]?.width || 0,
        timelineWidth: timelineRect?.width || 0,
        eventRowHeight: eventRect?.height || 0,
        timelineIsLight: Boolean(timeline && isLight(timeline)),
        mapTitleIsLight: Boolean(mapTitle && isLight(mapTitle)),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    });
    assert.equal(layout.bodyScrollable, true, JSON.stringify(layout));
    assert.ok(['auto', 'scroll'].includes(layout.bodyOverflowY), JSON.stringify(layout));
    assert.equal(layout.tableFits, true, JSON.stringify(layout));
    assert.ok(layout.drawerLeft <= layout.viewportWidth * 0.1, JSON.stringify(layout));
    assert.ok(layout.lastRowBottom <= layout.viewportHeight, JSON.stringify(layout));
    assert.equal(layout.timelineAfterPlayers, true, JSON.stringify(layout));
    assert.equal(layout.timelineBelowTable, true, JSON.stringify(layout));
    assert.equal(layout.roundsStacked, true, JSON.stringify(layout));
    assert.ok(layout.roundWidth >= layout.timelineWidth * 0.9, JSON.stringify(layout));
    assert.ok(layout.eventRowHeight >= 28, JSON.stringify(layout));
    assert.equal(layout.timelineIsLight, true, JSON.stringify(layout));
    assert.equal(layout.mapTitleIsLight, true, JSON.stringify(layout));
    assert.equal(await page.getByRole('button', { name: '查看原始时间线' }).count(), 0);
    assert.equal(await page.locator('.timeline-round-block').count(), 2);
    assert.equal(await page.locator('.timeline-round-reset').filter({ hasText: '从 0:00 计时' }).count(), 2);
    assert.equal(await page.locator('.timeline-track i').count(), 7);
  }
  await page.screenshot({ path: output, fullPage: true });
  const timelineOutput = output.replace(/\.png$/u, '-timeline.png');
  await page.locator('.timeline-inspector').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.screenshot({ path: timelineOutput, fullPage: true });
  await page.locator('.player-data-table .el-table__expand-icon').first().click();
  await page.getByText('平均充能').first().waitFor();
  await page.getByRole('button', { name: /好莱坞/u }).click();
  await page.getByText('这张地图尚未同步 OWCS Studio 时间线。').waitFor();
  await page.getByRole('button', { name: /伊利奥斯/u }).click();
  await page.locator('.timeline-inspector-head code').filter({ hasText: 'r3' }).waitFor();
  assert.match(await page.locator('.timeline-event-row').first().innerText(), /hero_selected/u);
  await page.close();
  return timelineOutput;
}

async function capturePublic(context, output, mobile = false) {
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await installMocks(page);
  const query = new URLSearchParams({
    matchId: '7', seasonId: '1', team1Id: '1', team2Id: '2',
    team1: 'WBG', team2: 'JDG', tournament: 'OWCS 2026 中国赛区', from: 'visualize'
  });
  await page.goto(`http://127.0.0.1:${port}/visualize/match-detail?${query}`, { waitUntil: 'networkidle' });
  try {
    await page.locator('.tab-nav-item').filter({ hasText: '努巴尼' }).click();
  } catch (error) {
    const diagnostic = join(outputDirectory, `public-match-detail-${mobile ? 'mobile' : 'desktop'}-failure.png`);
    await page.screenshot({ path: diagnostic, fullPage: true });
    throw new Error([
      error.message,
      `URL: ${page.url()}`,
      `BODY: ${(await page.locator('body').innerText()).slice(0, 2400)}`,
      `BROWSER ERRORS: ${browserErrors.join('\n')}`,
      `SCREENSHOT: ${diagnostic}`
    ].join('\n'));
  }
  assert.equal(await page.locator('.stat-player-row').count(), 10);
  assert.equal(await page.locator('.stat-player-summary').count(), 10);
  assert.equal(await page.locator('.sp-expand').count(), 10);
  assert.equal(await page.locator('.player-hero-drawer, .player-hero-card').count(), 0);

  const firstPlayerSummary = page.locator('.stat-player-summary').first();
  const collapsedPlayerHeight = await firstPlayerSummary.evaluate(element => element.getBoundingClientRect().height);
  await firstPlayerSummary.click();
  const firstHeroDrawer = page.locator('.player-hero-drawer').first();
  await firstHeroDrawer.waitFor();
  const expandedPlayerHeight = await firstPlayerSummary.evaluate(element => element.getBoundingClientRect().height);
  assert.ok(Math.abs(expandedPlayerHeight - collapsedPlayerHeight) < 1, JSON.stringify({ collapsedPlayerHeight, expandedPlayerHeight }));
  assert.equal(await firstPlayerSummary.getAttribute('aria-expanded'), 'true');
  const playerSummaryLayout = await firstPlayerSummary.evaluate(element => {
    const kda = element.querySelector('.sp-kda')?.getBoundingClientRect();
    const expand = element.querySelector('.sp-expand')?.getBoundingClientRect();
    return {
      expandBelowKda: Boolean(kda && expand && expand.top >= kda.bottom - 1),
      expandCenteredUnderKda: Boolean(kda && expand && expand.left + expand.width / 2 >= kda.left && expand.left + expand.width / 2 <= kda.right)
    };
  });
  assert.deepEqual(playerSummaryLayout, { expandBelowKda: true, expandCenteredUnderKda: true });
  assert.equal(await firstHeroDrawer.locator('.player-hero-card').count(), 4);
  const heroCardRects = await firstHeroDrawer.locator('.player-hero-card').evaluateAll(cards => cards.map(card => {
    const rect = card.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  assert.ok(heroCardRects.slice(0, 3).every(rect => Math.abs(rect.width - heroCardRects[0].width) < 1), JSON.stringify(heroCardRects));
  assert.ok(heroCardRects.slice(0, 3).every(rect => Math.abs(rect.y - heroCardRects[0].y) < 1), JSON.stringify(heroCardRects));
  assert.ok(heroCardRects[3].y > heroCardRects[0].y, JSON.stringify(heroCardRects));
  assert.ok(heroCardRects.every(rect => rect.height <= (mobile ? 48 : 54)), JSON.stringify(heroCardRects));
  const heroPortraitRects = await firstHeroDrawer.locator('.player-hero-portrait').evaluateAll(portraits => portraits.map(portrait => {
    const rect = portrait.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  assert.ok(heroPortraitRects.every(rect => Math.abs(rect.width - rect.height) < 1), JSON.stringify(heroPortraitRects));
  assert.equal(await firstHeroDrawer.getByText('最后一击').count(), 4);
  assert.equal(await firstHeroDrawer.getByText('死亡', { exact: true }).count(), 4);
  assert.equal(await firstHeroDrawer.getByText('大招释放').count(), 0);
  assert.equal(await firstHeroDrawer.getByText('平均充能').count(), 4);
  assert.deepEqual(
    await firstHeroDrawer.locator('.player-hero-usage').allInnerTexts(),
    ['66%', '20%', '10%', '4%']
  );
  assert.match(await firstHeroDrawer.locator('.player-hero-card').first().innerText(), /最后一击\s*7\s*死亡\s*5\s*平均充能\s*128s/u);
  const averageChargePartsFit = await firstHeroDrawer.locator('.player-hero-card').first().locator('.player-hero-metrics div').last().evaluate(element => {
    const label = element.querySelector('dt');
    const value = element.querySelector('dd');
    return Boolean(
      label && value
      && label.scrollWidth <= label.clientWidth + 1
      && value.scrollWidth <= value.clientWidth + 1
    );
  });
  assert.equal(averageChargePartsFit, true);
  assert.equal(await firstHeroDrawer.locator('.player-hero-metrics').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  if (mobile) await firstHeroDrawer.screenshot({ path: output.replace(/\.png$/u, '-heroes.png') });
  await page.waitForTimeout(450);
  await page.screenshot({ path: output, fullPage: true });

  await page.getByRole('radio', { name: '地图分析' }).click();
  await page.getByRole('heading', { name: '时间线' }).waitFor();
  await page.getByRole('button', { name: /R2/u }).click();
  const allMarkerCount = await page.locator('.lane-marker').count();
  assert.ok(allMarkerCount >= 10, String(allMarkerCount));

  const viewport = page.locator('.map-timeline__viewport');
  const canvas = page.locator('.map-timeline__canvas');
  const lane = page.locator('.player-event-lane').first();
  const zoomSlider = page.getByRole('slider', { name: '时间线缩放' });
  const defaultScale = {
    width: await canvas.evaluate(element => Number.parseFloat(element.style.width)),
    laneHeight: await lane.evaluate(element => element.getBoundingClientRect().height),
    value: Number(await zoomSlider.inputValue()),
    min: Number(await zoomSlider.getAttribute('min')),
    max: Number(await zoomSlider.getAttribute('max'))
  };
  assert.equal(defaultScale.value, defaultScale.max, JSON.stringify(defaultScale));
  assert.ok(defaultScale.min <= defaultScale.max, JSON.stringify(defaultScale));

  // Two touch pointers must not change the time scale now that zoom is an explicit slider.
  await viewport.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const fire = (type, pointerId, x) => element.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + x,
      clientY: rect.top + 90,
      pointerId,
      pointerType: 'touch',
      isPrimary: pointerId === 101
    }));
    fire('pointerdown', 101, 80);
    fire('pointerdown', 102, 180);
    fire('pointermove', 102, 270);
    fire('pointerup', 102, 270);
    fire('pointerup', 101, 80);
  });
  await page.waitForTimeout(180);
  const afterTwoFingerGesture = {
    width: await canvas.evaluate(element => Number.parseFloat(element.style.width)),
    laneHeight: await lane.evaluate(element => element.getBoundingClientRect().height)
  };
  assert.ok(Math.abs(afterTwoFingerGesture.width - defaultScale.width) < 1, JSON.stringify({ defaultScale, afterTwoFingerGesture }));
  assert.ok(Math.abs(afterTwoFingerGesture.laneHeight - defaultScale.laneHeight) < 1, JSON.stringify({ defaultScale, afterTwoFingerGesture }));
  await page.getByRole('button', { name: '大招', exact: true }).click();
  assert.ok(await page.locator('.lane-marker.ultimate').count() >= 3);
  assert.equal(await page.locator('.lane-marker:not(.ultimate)').count(), 0);
  await page.getByRole('button', { name: '全部', exact: true }).click();

  const hasHorizontalOverflow = await viewport.evaluate(element => element.scrollWidth > element.clientWidth);
  if (hasHorizontalOverflow) {
    await viewport.evaluate(element => {
      element.scrollLeft = Math.max(120, (element.scrollWidth - element.clientWidth) * 0.35);
    });
    const scrollBeforeDrag = await viewport.evaluate(element => element.scrollLeft);
    const viewportBox = await viewport.boundingBox();
    assert.ok(viewportBox);
    await page.mouse.move(viewportBox.x + viewportBox.width * 0.72, viewportBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(viewportBox.x + viewportBox.width * 0.45, viewportBox.y + 80, { steps: 4 });
    await page.mouse.up();
    const scrollAfterRelease = await viewport.evaluate(element => element.scrollLeft);
    assert.ok(scrollAfterRelease > scrollBeforeDrag, JSON.stringify({ scrollBeforeDrag, scrollAfterRelease }));
    await page.waitForTimeout(180);
    const scrollAfterMomentum = await viewport.evaluate(element => element.scrollLeft);
    assert.ok(scrollAfterMomentum > scrollAfterRelease + 1, JSON.stringify({ scrollBeforeDrag, scrollAfterRelease, scrollAfterMomentum }));
  }

  await zoomSlider.evaluate(element => {
    element.value = element.min;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(80);
  const compactScale = {
    width: await canvas.evaluate(element => Number.parseFloat(element.style.width)),
    renderedWidth: await canvas.evaluate(element => element.getBoundingClientRect().width),
    laneHeight: await lane.evaluate(element => element.getBoundingClientRect().height),
    value: Number(await zoomSlider.inputValue()),
    viewportWidth: await viewport.evaluate(element => element.clientWidth),
    hasOverflow: await viewport.evaluate(element => element.scrollWidth > element.clientWidth + 1)
  };
  assert.equal(compactScale.value, defaultScale.min, JSON.stringify({ defaultScale, compactScale }));
  if (defaultScale.min < defaultScale.max) {
    assert.ok(compactScale.width < defaultScale.width, JSON.stringify({ defaultScale, compactScale }));
  }
  assert.ok(compactScale.renderedWidth <= compactScale.viewportWidth + 1, JSON.stringify({ defaultScale, compactScale }));
  assert.equal(compactScale.hasOverflow, false, JSON.stringify({ defaultScale, compactScale }));
  assert.ok(Math.abs(compactScale.laneHeight - defaultScale.laneHeight) < 1, JSON.stringify({ defaultScale, compactScale }));

  await page.locator('.lane-marker.ultimate').first().evaluate(element => element.click());
  await page.locator('.map-timeline__selection').waitFor();
  const timelineOutput = output.replace(/\.png$/u, '-timeline.png');
  await page.locator('.map-timeline').scrollIntoViewIfNeeded();
  await page.screenshot({ path: timelineOutput, fullPage: true });

  const layout = await page.evaluate(() => {
    const timeline = document.querySelector('.map-timeline');
    const radar = document.querySelector('.map-player-radar');
    const timelineRect = timeline?.getBoundingClientRect();
    const radarRect = radar?.getBoundingClientRect();
    const board = document.querySelector('.map-timeline__board');
    const boardRect = board?.getBoundingClientRect();
    const boardRgb = getComputedStyle(board).backgroundColor.match(/\d+/gu)?.slice(0, 3).map(Number) || [];
    const roundButtons = [...document.querySelectorAll('.map-timeline__rounds button')];
    const activeRoundLabel = document.querySelector('.map-timeline__rounds button.active b');
    const eventMarkers = [...document.querySelectorAll('.lane-marker')];
    const playerLabels = [...document.querySelectorAll('.lane-label--player')];
    const playerLanes = [...document.querySelectorAll('.player-event-lane')];
    const toolbarRect = document.querySelector('.map-timeline__toolbar')?.getBoundingClientRect();
    const roundsRect = document.querySelector('.map-timeline__rounds')?.getBoundingClientRect();
    const filtersRect = document.querySelector('.map-timeline__filters')?.getBoundingClientRect();
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      timelineBelowRadar: Boolean(timelineRect && radarRect && timelineRect.top >= radarRect.bottom - 1),
      roundCount: roundButtons.length,
      eventMarkers: eventMarkers.length,
      playerLabelCount: playerLabels.length,
      playerLaneCount: playerLanes.length,
      roundCanvasCount: document.querySelectorAll('.map-timeline__canvas').length,
      boardHeight: boardRect?.height || 0,
      boardIsLight: boardRgb.length === 3 && boardRgb.reduce((sum, channel) => sum + channel, 0) / 3 > 220,
      minRoundWidth: Math.min(...roundButtons.map(button => button.getBoundingClientRect().width)),
      viewportWidth: window.innerWidth,
      timelineWidth: timelineRect?.width || 0,
      toolbarHeight: toolbarRect?.height || 0,
      roundToFilterGap: roundsRect && filtersRect ? filtersRect.top - roundsRect.bottom : 0,
      roundLabelBottomGap: roundsRect && activeRoundLabel
        ? roundsRect.bottom - activeRoundLabel.getBoundingClientRect().bottom
        : 0,
      phaseLaneCount: document.querySelectorAll('.phase-lane').length,
      tickLaneCount: document.querySelectorAll('.tick-lane').length,
      axisLabel: document.querySelector('.lane-label--axis')?.textContent?.trim() || '',
      zoomControlCount: document.querySelectorAll('.map-timeline__zoom').length,
      zoomValueText: document.querySelector('.map-timeline__zoom output')?.textContent?.trim() || '',
      zoomMinimum: Number(document.querySelector('.map-timeline__zoom input')?.min || 0),
      viewportLabel: document.querySelector('.map-timeline__viewport')?.getAttribute('aria-label') || ''
    };
  });
  assert.equal(layout.horizontalOverflow, false, JSON.stringify(layout));
  assert.equal(layout.timelineBelowRadar, true, JSON.stringify(layout));
  assert.equal(layout.roundCount, 2, JSON.stringify(layout));
  assert.ok(layout.eventMarkers >= 10, JSON.stringify(layout));
  assert.equal(layout.playerLabelCount, 10, JSON.stringify(layout));
  assert.equal(layout.playerLaneCount, 10, JSON.stringify(layout));
  assert.equal(layout.roundCanvasCount, 1, JSON.stringify(layout));
  assert.ok(layout.boardHeight > 200 && layout.boardHeight <= 255, JSON.stringify(layout));
  assert.equal(layout.boardIsLight, true, JSON.stringify(layout));
  assert.ok(layout.minRoundWidth >= 50, JSON.stringify(layout));
  assert.ok(layout.toolbarHeight >= 44 && layout.toolbarHeight <= 48, JSON.stringify(layout));
  assert.ok(layout.roundToFilterGap <= 6, JSON.stringify(layout));
  assert.ok(layout.roundLabelBottomGap <= 12, JSON.stringify(layout));
  assert.equal(layout.phaseLaneCount, 0, JSON.stringify(layout));
  assert.equal(layout.tickLaneCount, 1, JSON.stringify(layout));
  assert.equal(layout.axisLabel, 'R2', JSON.stringify(layout));
  assert.equal(layout.zoomControlCount, 1, JSON.stringify(layout));
  assert.equal(layout.zoomValueText, `${Math.round(layout.zoomMinimum * 100)}%`, JSON.stringify(layout));
  assert.doesNotMatch(layout.viewportLabel, /双指|缩放/u, JSON.stringify(layout));
  if (mobile) assert.ok(layout.timelineWidth >= layout.viewportWidth - 2, JSON.stringify(layout));
  assert.equal(await page.getByText('ROUND TELEMETRY').count(), 0);
  assert.equal(await page.getByText('每个有效回合独立从 0:00 计时').count(), 0);

  await page.locator('.tab-nav-item').filter({ hasText: '好莱坞' }).click();
  await page.locator('.stat-player-row').first().waitFor();
  assert.equal(await page.locator('.sp-expand, .player-hero-drawer, .player-hero-card').count(), 0);
  await page.getByRole('radio', { name: '地图分析' }).click();
  await page.locator('.map-player-radar').waitFor();
  assert.equal(await page.locator('.map-timeline').count(), 0);
  assert.deepEqual(browserErrors, []);
  await page.close();
  return timelineOutput;
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
  const desktopTimeline = await capture(await browser.newContext({ viewport: { width: 1600, height: 1000 } }), desktop);
  const mobileTimeline = await capture(await browser.newContext({ viewport: { width: 700, height: 1050 } }), mobile, true);
  const publicDesktop = join(outputDirectory, 'public-match-detail-desktop.png');
  const publicMobile = join(outputDirectory, 'public-match-detail-mobile.png');
  const publicDesktopTimeline = await capturePublic(await browser.newContext({ viewport: { width: 1366, height: 900 } }), publicDesktop);
  const publicMobileTimeline = await capturePublic(await browser.newContext({ viewport: { width: 390, height: 844 } }), publicMobile, true);
  process.stdout.write(JSON.stringify({
    desktop, desktopTimeline, mobile, mobileTimeline,
    publicDesktop, publicDesktopTimeline, publicMobile, publicMobileTimeline
  }, null, 2) + '\n');
} finally {
  await browser?.close();
  vite.kill();
}
