import { access, readFile } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright-core';
import path from 'node:path';

const baseUrl = process.env.OWCS_STATIC_PREVIEW_URL || 'http://127.0.0.1:4174/';
const screenshotDirectory = process.env.OWCS_STATIC_SCREENSHOT_DIR || '';
import { readStaticData } from '../src/services/staticSnapshot.mjs';
import { openDisplayPackage } from './lib/display-package.mjs';
const live = process.argv.includes('--api');
const siteConfig = live ? JSON.parse(await readFile('dist-api/site-config.json', 'utf8')) : null;
const manifest = live ? null : JSON.parse(await readFile('dist/static-data/manifest.json', 'utf8'));
const bundle = live ? null : await openDisplayPackage('dist');
const load = async name => bundle.json(`static-data/${manifest.files[name].path}`);
const get = async (path, params = {}) => {
  if (!live) return readStaticData(load, path, params);
  const response = await fetch(`${siteConfig.apiBaseUrl}${path}?${new URLSearchParams(params)}`);
  if (!response.ok) throw new Error(`API smoke data failed: ${path} ${response.status}`);
  return response.json();
};
const list = value => Array.isArray(value) ? value : value?.data || value?.list || [];

const chromeCandidates = [
  process.env.CHROME_PATH,
  `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

let executablePath;
for (const candidate of chromeCandidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Try the next installed browser.
  }
}
if (!executablePath) throw new Error('未找到 Chrome/Edge；可通过 CHROME_PATH 指定浏览器');

const seasons = await get('/seasons');
const seasonTeams = await get('/season-teams');
const matches = list(await get('/matches', { pageSize: live ? 10000 : 1000000 }));
const upcoming = list(await get('/matches/upcoming'));
const selectedSeasonTeam = seasonTeams.find(team => team.seasonId === seasons[0]?.id) || seasonTeams[0];
const selectedRelations = await get(`/season-teams/${selectedSeasonTeam.id}/players`);
const selectedPlayer = selectedRelations[0];
const games = live ? await get('/map-games', { pageSize: 10000 }) : await load('collections.mapGames');
const selectedMatch = matches.find(match => games.some(game => game.matchId === match.id && game.timeline))
  || matches.find(match => games.some(game => game.matchId === match.id));
const selectedUpcoming = upcoming[0];
const selectedSeason = seasons.find(season => String(season.id) === String(selectedSeasonTeam.seasonId)) || seasons[0];

const pages = [
  { name: '可视化首页', hash: '#/visualize', ready: '.vis-body', verifyHeroTabs: true },
  {
    name: '赛程列表',
    hash: '#/visualize',
    ready: '.vis-body',
    verifySchedule: true
  },
  {
    name: '战队详情',
    hash: `#/visualize/team-detail?seasonId=${selectedSeasonTeam.seasonId}&teamId=${selectedSeasonTeam.teamId}`,
    ready: '.team-detail-page .detail-container',
    localLogo: '.team-logo-large'
  },
  {
    name: '选手详情',
    hash: `#/visualize/player-detail?seasonId=${selectedSeasonTeam.seasonId}&playerId=${selectedPlayer.playerId}`,
    ready: '.player-detail-page .detail-container'
  },
  {
    name: '比赛详情',
    hash: `#/visualize/match-detail?seasonId=${selectedMatch.seasonId}&matchId=${selectedMatch.id}`,
    ready: '.match-detail-page .detail-container'
  }
];

if (selectedUpcoming) {
  pages.push({
    name: 'Upcoming 详情',
    hash: `#/visualize/upcoming-match?seasonId=${selectedSeason.id}&t1=${encodeURIComponent(selectedUpcoming.team1?.name || 'TBD')}&t2=${encodeURIComponent(selectedUpcoming.team2?.name || 'TBD')}&time=${selectedUpcoming.timestamp || ''}`,
    ready: '.upcoming-detail-page .detail-container'
  });
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: process.env.CI ? ['--no-sandbox'] : []
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const apiRequests = [];
const externalRequests = [];

const staticDataMissing = [];
const pageErrors = [];

// Fail closed: a static package must work with every external request blocked.
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (live && (url.href.startsWith(`${siteConfig.apiBaseUrl}/`) || (url.origin === siteConfig.mediaOrigin && url.pathname.startsWith('/media/')))) return route.continue();
  if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseUrl).origin) {
    externalRequests.push(url.href); return route.abort();
  }
  if (/\/(?:api|public-api|poll-api|data\/v1)\//.test(url.pathname)) {
    apiRequests.push(url.href); return route.abort();
  }
  return route.continue();
});
page.on('console', message => {
  if (message.type() === 'error' && (/静态数据|Content Security Policy|Failed to load resource/.test(message.text()))) {
    staticDataMissing.push(message.text());
  }
});
page.on('pageerror', error => pageErrors.push(error.message));

try {
  for (const target of pages) {
    await page.goto(`${baseUrl}${target.hash}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.locator(target.ready).waitFor({ state: 'visible', timeout: 60_000 });
    if (target.verifyHeroTabs) {
      await page.getByRole('tab', { name: '赛事积分' }).click();
      await page.locator('.regular-season-container').waitFor({ state: 'visible', timeout: 60_000 });
      if (await page.locator('.overview-dashboard').count()) {
        throw new Error('赛事概览仍渲染已移除的赛事速览区域');
      }
      await page.getByRole('tab', { name: '赛事数据' }).click();
      await page.locator('.stats-category-choices').waitFor({ state: 'visible', timeout: 10_000 });
      const heroChoice = page.getByRole('radio', { name: '英雄' });
      if (await heroChoice.count()) {
        await heroChoice.click();
        await page.locator('.hero-overview-chart').waitFor({ state: 'visible', timeout: 60_000 });
        const firstHero = page.locator('.hero-item').first();
        if (await firstHero.count()) {
          await firstHero.waitFor({ state: 'visible', timeout: 60_000 });
          await page.waitForFunction(() => {
            const panel = document.querySelector('.stats-category-panel');
            return panel && getComputedStyle(panel).transform === 'none';
          });

          const verifyHeroScrollLayers = async (mobile = false) => {
            const metrics = await page.evaluate(() => {
              const rect = selector => {
                const box = document.querySelector(selector)?.getBoundingClientRect();
                return box ? { top: box.top, bottom: box.bottom } : null;
              };
              const tabContent = document.querySelector('.tab-content');
              const scrollArea = document.querySelector('.hero-scroll-area');
              scrollArea.scrollTop = 0;
              const before = {
                category: rect('.stats-category-choices'),
                filters: rect('.hero-filters'),
                firstHero: rect('.hero-item'),
                tabScrollTop: tabContent?.scrollTop || 0
              };
              scrollArea.scrollTop = Math.min(240, Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight));
              const style = getComputedStyle(scrollArea);
              const after = {
                category: rect('.stats-category-choices'),
                filters: rect('.hero-filters'),
                firstHero: rect('.hero-item'),
                tabScrollTop: tabContent?.scrollTop || 0
              };
              return {
                before,
                after,
                scrollable: scrollArea.scrollHeight > scrollArea.clientHeight,
                scrollbarWidth: scrollArea.offsetWidth - scrollArea.clientWidth,
                firefoxScrollbarWidth: style.scrollbarWidth
              };
            });

            const filterGap = metrics.before.filters.top - metrics.before.category.bottom;
            const fixed = Math.abs(metrics.after.category.top - metrics.before.category.top) < 1
              && Math.abs(metrics.after.filters.top - metrics.before.filters.top) < 1
              && metrics.after.tabScrollTop === 0;
            const contentMoved = metrics.after.firstHero.top < metrics.before.firstHero.top;
            if (filterGap < -1 || !fixed || (metrics.scrollable && !contentMoved)) {
              throw new Error(`英雄细化 Tab 与内容滚动层级异常: ${JSON.stringify(metrics)}`);
            }
            if (mobile && (metrics.scrollbarWidth > 0 || metrics.firefoxScrollbarWidth !== 'none')) {
              throw new Error(`英雄列表移动端仍显示滚动条: ${JSON.stringify(metrics)}`);
            }
          };

          await verifyHeroScrollLayers();
          await page.setViewportSize({ width: 390, height: 844 });
          await verifyHeroScrollLayers(true);
          await page.setViewportSize({ width: 1440, height: 1000 });
        }
      }
    }
    if (target.verifySchedule) {
      await page.getByRole('tab', { name: '赛程列表' }).click();
      await page.locator('.schedule-shell').waitFor({ state: 'visible', timeout: 60_000 });
      await page.locator('.schedule-match').first().waitFor({ state: 'visible', timeout: 60_000 });
      await page.waitForFunction(() => {
        const tabContent = document.querySelector('.tab-content');
        return tabContent && getComputedStyle(tabContent).transform === 'none';
      });
      const tabsBox = await page.locator('.vis-tabs-container').boundingBox();
      const dateRailBox = await page.locator('.date-rail-wrap').boundingBox();
      if (!tabsBox || !dateRailBox) {
        throw new Error('无法测量赛程 Tab 栏和日期栏的位置');
      }
      const scheduleTopGap = Math.round(dateRailBox.y - (tabsBox.y + tabsBox.height));
      if (scheduleTopGap > 1) {
        throw new Error(`赛程日期栏与 Tab 栏之间仍有 ${scheduleTopGap}px 空白`);
      }
      const firstMatch = page.locator('.schedule-match').first();
      const leftTeamBox = await firstMatch.locator('.team-side--left').boundingBox();
      const rightTeamBox = await firstMatch.locator('.team-side--right').boundingBox();
      if (!leftTeamBox || !rightTeamBox || Math.abs(leftTeamBox.width - rightTeamBox.width) > 1) {
        throw new Error('赛程比赛行的左右队伍区域不对称');
      }
      const scheduleTitle = await page.locator('#schedule-title').textContent();
      if (scheduleTitle?.trim() !== '赛程列表') {
        throw new Error(`赛程标题异常: ${scheduleTitle || '(empty)'}`);
      }
      const teamFontFamily = await firstMatch.locator('.team-name').first().evaluate(element => getComputedStyle(element).fontFamily);
      if (!teamFontFamily.toLowerCase().includes('oxanium')) {
        throw new Error(`比赛队名字体未使用展示字体: ${teamFontFamily}`);
      }
      if (!await firstMatch.locator('.match-enter-indicator').count()) {
        throw new Error('比赛主体缺少进入详情指示');
      }
      await page.locator('.date-chip--all').click();
      const completedMatch = page.locator('.schedule-match.is-completed').first();
      if (await completedMatch.count()) {
        const scoreFontFamily = await completedMatch.locator('.score-number').first().evaluate(element => getComputedStyle(element).fontFamily);
        if (!scoreFontFamily.toLowerCase().includes('oxanium')) {
          throw new Error(`比赛比分未使用数字字体: ${scoreFontFamily}`);
        }
        if (await completedMatch.locator('.winner-indicator.visible').count() !== 1) {
          throw new Error('已结束比赛缺少唯一胜方指示');
        }
      }
      if (await page.locator('.upcoming-fab-root').count()) {
        throw new Error('统一赛程启用后仍显示旧悬浮赛程入口');
      }
      if (screenshotDirectory) {
        await page.screenshot({
          path: path.join(screenshotDirectory, 'schedule-desktop.png'),
          fullPage: true
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const viewportMetrics = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      }));
      if (viewportMetrics.scrollWidth > viewportMetrics.clientWidth + 1) {
        throw new Error(`赛程移动端出现横向滚动: ${viewportMetrics.scrollWidth}px > ${viewportMetrics.clientWidth}px`);
      }
      const mobileScrollMetrics = await page.locator('.tab-content').evaluate(element => {
        const before = element.scrollTop;
        element.scrollTop = Math.min(180, Math.max(0, element.scrollHeight - element.clientHeight));
        const style = getComputedStyle(element);
        const after = element.scrollTop;
        return {
          before,
          after,
          canScroll: element.scrollHeight > element.clientHeight,
          scrollbarWidth: element.offsetWidth - element.clientWidth,
          firefoxScrollbarWidth: style.scrollbarWidth
        };
      });
      if (mobileScrollMetrics.canScroll && mobileScrollMetrics.after <= mobileScrollMetrics.before) {
        throw new Error('赛程移动端内容区无法纵向滚动');
      }
      if (mobileScrollMetrics.scrollbarWidth > 0 || mobileScrollMetrics.firefoxScrollbarWidth !== 'none') {
        throw new Error(`赛程移动端仍显示滚动条: ${JSON.stringify(mobileScrollMetrics)}`);
      }
      if (screenshotDirectory) {
        await page.screenshot({
          path: path.join(screenshotDirectory, 'schedule-mobile.png'),
          fullPage: true
        });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      const replayToggle = page.locator('.replay-toggle').first();
      if (await replayToggle.count()) {
        const replayMatch = replayToggle.locator('xpath=ancestor::article[contains(@class, "schedule-match")]');
        await replayToggle.click();
        await replayMatch.locator('.replay-list').waitFor({ state: 'visible', timeout: 10_000 });
      }
      await page.locator('.match-main').first().click();
      await page.waitForURL(/\/visualize\/(?:match-detail|upcoming-match)/, { timeout: 10_000 });
    }
    if (target.localLogo) {
      const src = await page.locator(target.localLogo).first().getAttribute('src');
      if (!live && (!src?.startsWith('blob:') || new URL(src).origin !== new URL(baseUrl).origin)) {
        throw new Error(`${target.name} 未使用本地队伍图标: ${src || '(empty)'}`);
      }
      await page.locator(target.localLogo).first().evaluate(image => image.decode());
    }
    if (await page.locator('.match-support').count()) throw new Error('静态包仍显示投票组件');
    console.log(`[static-smoke] PASS ${target.name}`);
  }

  if (apiRequests.length) throw new Error(`静态站仍请求后端 API:\n${apiRequests.join('\n')}`);
  if (externalRequests.length) throw new Error(`静态站仍请求外部资源:\n${externalRequests.join('\n')}`);
  if (staticDataMissing.length) throw new Error(staticDataMissing.join('\n'));
  if (pageErrors.length) throw new Error(`页面脚本错误:\n${pageErrors.join('\n')}`);
  console.log(`[static-smoke] 完成：${pages.length} 个页面，${live ? '仅受信任的展示接口和媒体请求' : '0 个外部请求'}，0 个投票请求，0 个错误`);
} finally {
  await browser.close();
}
