import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build, preview } from 'vite';
import { resolve, relative } from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { apiFixture } from './fixtures/analytics.mjs';

// SDK + API traffic is intercepted locally. Production analytics stays untouched.
process.env.VITE_ANALYTICS_ENABLED = 'true';
process.env.VITE_ANALYTICS_DEBUG = 'true';
process.env.VITE_UMAMI_SCRIPT_URL = '/analytics-sdk.js';
const sdk = process.env.UMAMI_TRACKER_FIXTURE ? await readFile(process.env.UMAMI_TRACKER_FIXTURE, 'utf8') : `window.umami={track: fn => fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'event',payload:fn({website:'fixture',url:location.href,title:document.title,referrer:document.referrer})})})};`;
const buildDirectory = resolve('.local/analytics-build');
assert.equal(relative(resolve('.local'), buildDirectory), 'analytics-build');
await build({ mode: 'production', build: { outDir: buildDirectory, emptyOutDir: true }, logLevel: 'error' });
const server = await preview({ build: { outDir: buildDirectory }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
console.log('QA server ready');
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await launchBrowser(), sent = [], errors = [];
console.log('QA browser ready');
const output = '.local/analytics';
await mkdir(output, { recursive: true });
let releaseScript, activePage, failVote = false, delayAnswer = false, releaseAnswer, answerQueued;
const poll = { sourceId: '77', team1Id: 1, team2Id: 2, closed: false, total: 0, votes: { 1: 0, 2: 0 }, myTeamId: null };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/analytics-sdk.js') { releaseScript = () => route.fulfill({ contentType: 'application/javascript', body: sdk }); return; }
    if (url.pathname === '/api/send') {
      sent.push(route.request().postDataJSON().payload);
      return route.fulfill({ json: { cache: 'fixture' } });
    }
    if (url.pathname === '/assistant/v1/status') return route.fulfill({ json: { showInVisualize: true } });
    if (url.pathname === '/assistant/v1/chat') {
      const fulfill = () => route.fulfill({ contentType: 'application/x-ndjson', body: [{ type: 'text', text: '这是埋点测试回答。' }, { type: 'done', metrics: { total_ms: 5 } }].map(x => JSON.stringify(x)).join('\n') + '\n' });
      if (delayAnswer) { releaseAnswer = fulfill; answerQueued(); return; }
      return fulfill();
    }
    if (url.pathname === '/poll-api/visitor') return route.fulfill({ json: { token: 'fixture-token' } });
    if (url.pathname === '/poll-api/vote') {
      if (failVote) return route.fulfill({ status: 503, json: { error: 'fixture failure' } });
      poll.myTeamId = route.request().postDataJSON().teamId; poll.total = 1; poll.votes[poll.myTeamId] = 1;
      return route.fulfill({ json: { sources: { 77: poll }, matches: {} } });
    }
    if (url.pathname.startsWith('/poll-api/')) return route.fulfill({ json: { sources: { 77: poll }, matches: {} } });
    if (/^\/(public-api|api)\//.test(url.pathname)) return route.fulfill({ json: apiFixture(url.pathname.replace(/^\/(public-api|api)/, ''), url.searchParams) });
    return route.continue();
  });
  const page = await context.newPage();
  console.log('QA page ready');
  activePage = page;
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const event = (name, predicate = () => true) => sent.filter(item => item.name === name && predicate(item.data || {}));
  const waitEvent = async (name, predicate) => {
    for (let i = 0; i < 100; i++) { const found = event(name, predicate).at(-1); if (found) return found; await page.waitForTimeout(100); }
    throw new Error(`Missing event ${name}. Received names: ${sent.map(item => item.name || 'PV').join(', ')}`);
  };
  await page.goto(`${base}/visualize?seasonId=24&utm_source=qa&private=do-not-send`, { waitUntil: 'commit' });
  await page.locator('.schedule-match').first().waitFor();
  console.log('Home rendered with delayed SDK');
  assert.equal(sent.length, 0, 'SDK delay must queue events');
  await releaseScript();
  const initial = await waitEvent('访问-内容加载完成');
  assert.equal(initial.data['赛事'], 'OWCS 2026 中国赛区 第三赛段');
  assert.equal(initial.data['结果'], '成功');
  assert.equal(sent.filter(item => !item.name).length, 1, 'one initial PV');
  assert.equal(sent.find(item => !item.name).url, '/visualize?utm_source=qa');
  assert.equal(event('浏览-切换内容').length, 0, 'default tab is not an action');
  await page.getByRole('tab', { name: '赛事数据', exact: true }).click();
  await waitEvent('浏览-切换内容', data => data['内容分区'] === '赛事数据');
  await page.locator('.team-cell-clickable').first().waitFor();
  await waitEvent('功能-有效曝光', data => data['功能'] === '战队排行榜');
  await page.locator('.export-btn-small').click();
  await waitEvent('导出-生成结果', data => data['结果'] === '预览已生成');
  await page.locator('.chart-export-dialog .el-dialog__headerbtn').click();
  // A genuine rendering failure must never be counted as generated/saved.
  await page.evaluate(() => { window.qaToDataURL = HTMLCanvasElement.prototype.toDataURL; HTMLCanvasElement.prototype.toDataURL = () => { throw new Error('fixture canvas failure'); }; });
  await page.locator('.export-btn-small').click();
  await waitEvent('导出-生成结果', data => data['结果'] === '失败');
  await page.evaluate(() => { HTMLCanvasElement.prototype.toDataURL = window.qaToDataURL; delete window.qaToDataURL; });
  await page.locator('.team-cell-clickable').first().click();
  await waitEvent('访问-内容加载完成', data => data['页面'] === '战队详情');
  await page.getByRole('tab', { name: '历史比赛', exact: true }).click();
  await waitEvent('浏览-切换内容', data => data['页面'] === '战队详情' && data['内容分区'] === '历史比赛');
  assert.equal(await page.getByRole('tab', { name: '历史比赛', exact: true }).getAttribute('aria-selected'), 'true');
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/visualize?seasonId=24&tab=stats'));
  await page.getByRole('tab', { name: '赛事数据', exact: true }).click();
  await page.getByRole('radio', { name: '选手', exact: true }).click();
  await page.locator('.player-link').first().waitFor();
  await page.locator('.player-link').first().click();
  const navigation = await waitEvent('导航-打开选手');
  assert.ok(navigation.data['选手'] && navigation.data['选手'] !== '名称未解析');
  await waitEvent('访问-内容加载完成', data => data['页面'] === '选手详情');
  const pvBeforeTab = sent.filter(item => !item.name).length;
  await page.getByRole('tab', { name: '近期出场', exact: true }).click();
  await waitEvent('浏览-切换内容', data => data['内容分区'] === '近期出场');
  await page.waitForTimeout(400);
  assert.equal(sent.filter(item => !item.name).length, pvBeforeTab, 'router.replace tab cannot emit PV');
  await page.getByRole('button', { name: '打开赛事助手' }).click();
  await page.locator('#assistant-input').fill('PRIVATE PROMPT: do not send this to Umami');
  await page.locator('.assistant-send').click();
  await waitEvent('助手-回答结果', data => data['结果'] === '完成');
  await page.screenshot({ path: `${output}/player-assistant.png` });
  delayAnswer = true;
  const pendingAnswer = new Promise(resolve => { answerQueued = resolve; });
  await page.locator('#assistant-input').fill('PRIVATE ASYNC QUESTION');
  await page.locator('.assistant-send').click();
  await pendingAnswer;
  // Navigate through the actual router to preserve the same analytics runtime.
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/visualize/match-detail?matchId=7&seasonId=24'));
  await page.locator('.tab-nav-item').nth(1).waitFor();
  const previousAnswers = event('助手-回答结果').length;
  await releaseAnswer();
  for (let i = 0; i < 100 && event('助手-回答结果').length === previousAnswers; i++) await page.waitForTimeout(100);
  assert.equal(event('助手-回答结果').at(-1).data['页面'], '选手详情', 'late answer stays on the originating page');
  assert.equal(event('助手-回答结果').at(-1).data['选手'], 'SHY');
  await page.locator('.assistant-actions button').last().click();
  await page.locator('.tab-nav-item').nth(1).click();
  const mapTab = await waitEvent('浏览-切换内容', data => data['地图'] === '尼泊尔');
  assert.equal(mapTab.data['内容分区'], '单图详情');
  await page.getByRole('radio', { name: '地图分析', exact: true }).click();
  await page.locator('.map-timeline__rounds button').nth(1).click();
  await waitEvent('时间线-切换回合');
  await page.locator('.map-timeline__filters button').filter({ hasText: '大招' }).click();
  await waitEvent('时间线-筛选事件', data => data['筛选项'] === '大招');
  await page.locator('.lane-marker').first().click();
  await waitEvent('时间线-查看事件');
  assert.equal(await page.locator('.map-timeline__selection').count(), 1, 'event details must really open');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/timeline-mobile.png` });
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/visualize/upcoming-match?seasonId=24&sourceId=77&team1=Weibo%20Gaming&team2=JD%20Gaming&time=1790344800'));
  await page.getByRole('button', { name: '支持 Weibo Gaming', exact: true }).click();
  const voted = await waitEvent('投票-提交结果', data => data['结果'] === '成功');
  assert.equal(voted.data['比赛'], 'Weibo Gaming vs JD Gaming'); assert.equal(voted.data['战队'], 'Weibo Gaming');
  failVote = true;
  await page.getByRole('button', { name: '支持 JD Gaming', exact: true }).click();
  await waitEvent('投票-提交结果', data => data['结果'] === '失败' && data['投票方式'] === '更改支持');
  const visits = sent.filter(item => !item.name).length;
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/visualize/player-detail?playerId=1&seasonId=24'));
  await page.locator('#player-name').waitFor();
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/visualize/player-detail?playerId=2&seasonId=24'));
  await waitEvent('访问-内容加载完成', data => data['选手'] === 'LIGE');
  assert.equal(sent.filter(item => !item.name).length, visits + 2, 'same-path different-player visits count');
  const countBeforeAdmin = sent.length;
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/dashboard'));
  await page.waitForTimeout(1400);
  assert.equal(sent.length, countBeforeAdmin, 'admin should not emit pageviews or events');
  const disabledContext = await browser.newContext();
  await disabledContext.addInitScript(() => localStorage.setItem('umami.disabled', '1'));
  const disabledPage = await disabledContext.newPage();
  let disabledSdkRequests = 0;
  await disabledPage.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/analytics-sdk.js') { disabledSdkRequests++; return route.abort(); }
    if (url.origin !== base || /^\/(public-api|api|poll-api|assistant)\//.test(url.pathname)) return route.fulfill({ json: [] });
    return route.continue();
  });
  await disabledPage.goto(`${base}/visualize`, { waitUntil: 'networkidle' });
  assert.equal(disabledSdkRequests, 0, 'opt-out must not load the tracker');
  await disabledContext.close();
  assert.doesNotMatch(JSON.stringify(sent), /PRIVATE|do-not-send|QA-CODE|team1Logo|fixture-token|fixture failure|fixture canvas/);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/events.json`, JSON.stringify(sent, null, 2));
  console.log(`Analytics browser verification passed: ${sent.length} payloads; ${process.env.UMAMI_TRACKER_FIXTURE ? 'real downloaded SDK' : 'isolated SDK contract fixture'}; no production sends.`);
} catch (error) {
  await writeFile(`${output}/events.json`, JSON.stringify(sent, null, 2));
  console.error('Browser verification failed:', error, errors);
  if (activePage) { console.error((await activePage.locator('body').innerText()).slice(0, 2500)); await activePage.screenshot({ path: `${output}/failure.png` }); }
  throw error;
} finally {
  await releaseScript?.().catch(() => {});
  await browser.close(); server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve));
}
