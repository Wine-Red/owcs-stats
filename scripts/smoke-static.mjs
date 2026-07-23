import { access, readFile } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright-core';

const baseUrl = process.env.OWCS_STATIC_PREVIEW_URL || 'http://127.0.0.1:4174/';
const snapshot = JSON.parse(await readFile('dist/static-data/api-cache.json', 'utf8'));
const responses = snapshot.responses;
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

const seasons = list(responses['/seasons']);
const seasonTeams = list(responses['/season-teams']);
const matches = list(responses['/matches?pageSize=2000']);
const upcoming = list(responses['/matches/upcoming']);
const selectedSeasonTeam = seasonTeams[0];
const selectedRelations = list(responses[`/season-teams/${selectedSeasonTeam.id}/players`]);
const selectedPlayer = selectedRelations[0];
const selectedMatch = matches.find(match => responses[`/matches/${match.id}/map-games`]?.length) || matches[0];
const selectedUpcoming = upcoming[0];
const selectedSeason = seasons.find(season => String(season.id) === String(selectedSeasonTeam.seasonId)) || seasons[0];

const pages = [
  { name: '可视化首页', hash: '#/visualize', ready: '.vis-body' },
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

page.on('request', request => {
  const url = new URL(request.url());
  const previewOrigin = new URL(baseUrl).origin;
  if (url.origin === previewOrigin && url.pathname.startsWith('/api/')) apiRequests.push(request.url());
  if (url.origin !== previewOrigin && /^https?:$/.test(url.protocol)) externalRequests.push(request.url());
});
page.on('console', message => {
  if (message.type() === 'error' && message.text().includes('静态快照缺少接口数据')) {
    staticDataMissing.push(message.text());
  }
});
page.on('pageerror', error => pageErrors.push(error.message));

try {
  for (const target of pages) {
    await page.goto(`${baseUrl}${target.hash}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.locator(target.ready).waitFor({ state: 'visible', timeout: 60_000 });
    if (target.localLogo) {
      const src = await page.locator(target.localLogo).first().getAttribute('src');
      if (!src?.includes('static-data/team-logos/')) {
        throw new Error(`${target.name} 未使用本地队伍图标: ${src || '(empty)'}`);
      }
    }
    console.log(`[static-smoke] PASS ${target.name}`);
  }

  if (apiRequests.length) throw new Error(`静态站仍请求后端 API:\n${apiRequests.join('\n')}`);
  if (externalRequests.length) throw new Error(`静态站仍请求外部资源:\n${externalRequests.join('\n')}`);
  if (staticDataMissing.length) throw new Error(staticDataMissing.join('\n'));
  if (pageErrors.length) throw new Error(`页面脚本错误:\n${pageErrors.join('\n')}`);
  console.log(`[static-smoke] 完成：${pages.length} 个页面，0 个 /api 请求，0 个外部请求，0 个快照缺失`);
} finally {
  await browser.close();
}
