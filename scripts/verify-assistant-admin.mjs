import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { launchBrowser } from './lib/browser.mjs';

const base = process.env.ASSISTANT_WEB_URL || 'http://127.0.0.1:8080';
const directory = '.local/assistant';
await mkdir(directory, { recursive: true });
const browser = await launchBrowser();
const errors = [], writes = [], checks = [];
const initial = { protocol: 'openai', baseUrl: 'https://api.example.com/v1', model: 'dots3-note-prev', maxTokens: 4096, dotsThinking: 'off', hasKey: true };
let stored = { ...initial }, failTest = false, offline = false, tests = 0, expiredStatus = 0, loginRequests = 0;
let showInVisualize = true, failDisplay = false;
const setupContext = async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  await context.route(/google-analytics|googletagmanager|clarity\.ms|hm\.baidu/, route => route.abort());
  return context;
};
try {
  const context = await setupContext();
  await context.addCookies([{ name: 'test-admin-session', value: 'signed-in', url: base }]);
  await context.route('**/test-admin-login', route => {
    loginRequests++; return route.fulfill({ contentType: 'text/html', body: 'Login page' });
  });
  await context.route('**/assistant/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.split('/').at(-1);
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (offline) return route.fulfill({ status: 502, contentType: 'text/html', body: 'Bad gateway' });
    if (path === 'status') return reply({ configured: !!stored.model, showInVisualize });
    if (path === 'conversations') return reply({ items: [], total: 0, offset: 0, limit: 25, retentionDays: 90, maxRecords: 2000 });
    assert.equal(request.headers().authorization, undefined, 'no assistant-specific credential');
    assert.match(request.headers().cookie || '', /test-admin-session=signed-in/, 'reuse the existing same-origin session');
    if (expiredStatus === 307) return route.fulfill({ status: 307, headers: { location: `${base}/test-admin-login` } });
    if (expiredStatus) return reply({ error: 'Login required' }, expiredStatus);
    if (path === 'display') {
      if (failDisplay) return reply({ error: '显示设置保存失败' }, 500);
      const body = request.postDataJSON(); assert.deepEqual(Object.keys(body), ['showInVisualize']);
      showInVisualize = body.showInVisualize; return reply({ showInVisualize });
    }
    if (path === 'settings') {
      if (request.method() === 'PUT') {
        const input = request.postDataJSON(); writes.push(input);
        stored = { ...input, hasKey: true, baseUrl: input.baseUrl.replace(/\/chat\/completions$/, '') }; delete stored.apiKey;
      }
      return reply(stored);
    }
    if (path === 'test') {
      tests++;
      return failTest ? reply({ error: '模型服务返回 400，请检查服务地址、协议和模型权限。' }, 502)
        : reply({ text: 'OK <script>alert(1)</script>', elapsed_ms: 850 });
    }
    throw new Error(`Unexpected assistant request: ${path}`);
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const businessReads = [];
  page.on('request', request => { if (/\/api\/(teams|players|matches|seasons)(?:[/?]|$)/.test(request.url())) businessReads.push(request.url()); });
  await page.goto(`${base}/data-manage/assistant`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '赛事助手', exact: true }).waitFor();
  assert.equal(await page.locator('.nav-item.router-link-active').innerText(), '赛事助手');
  const ready = () => page.waitForFunction(() => {
    const input = document.querySelector('#assistant-model'); return input && !input.matches(':disabled');
  });
  await ready();
  assert.equal(await page.locator('#assistant-admin-token').count(), 0);
  assert.equal(await page.getByRole('button', { name: '锁定设置', exact: true }).count(), 0);
  assert.equal(await page.locator('#assistant-model').inputValue(), initial.model);
  assert.equal(await page.locator('#assistant-api-key').inputValue(), '');
  assert.equal(await page.getByLabel('Dots 深度思考').inputValue(), 'off');
  checks.push('auto-load without a second credential', 'existing login cookie and secret masking');

  const displaySwitch = page.getByRole('switch', { name: '在可视化页面显示助手' });
  await page.waitForFunction(() => { const control = document.querySelector('.display-switch'); return control && !control.disabled; });
  await page.locator('#assistant-model').fill('unsaved-model');
  await displaySwitch.click();
  await page.getByRole('status').filter({ hasText: '已隐藏可视化页面的助手入口' }).waitFor();
  assert.equal(writes.length, 0); assert.equal(await page.locator('#assistant-model').inputValue(), 'unsaved-model');
  assert.equal(await displaySwitch.getAttribute('aria-checked'), 'false');
  failDisplay = true; await displaySwitch.click();
  await page.getByRole('alert').filter({ hasText: '显示设置保存失败' }).waitFor();
  assert.equal(await displaySwitch.getAttribute('aria-checked'), 'false'); failDisplay = false;
  const visual = await context.newPage();
  visual.on('pageerror', e => errors.push(e.message));
  const firstStatus = visual.waitForResponse('**/assistant/v1/status');
  await visual.goto(`${base}/visualize/match-detail?matchId=5446&seasonId=25`, { waitUntil: 'domcontentloaded' });
  await firstStatus;
  assert.equal(await visual.getByRole('button', { name: '打开赛事助手' }).count(), 0);
  const refreshVisibility = async () => {
    const response = visual.waitForResponse('**/assistant/v1/status');
    await visual.bringToFront();
    await visual.evaluate(() => window.dispatchEvent(new Event('focus'))); await response;
  };
  await displaySwitch.click();
  await page.getByRole('status').filter({ hasText: '已显示可视化页面的助手入口' }).waitFor();
  await refreshVisibility(); await visual.getByRole('button', { name: '打开赛事助手' }).click();
  await visual.getByRole('dialog', { name: '赛事助手' }).waitFor();
  await displaySwitch.click();
  await page.getByRole('status').filter({ hasText: '已隐藏可视化页面的助手入口' }).waitFor();
  await refreshVisibility(); await visual.getByRole('dialog', { name: '赛事助手' }).waitFor({ state: 'hidden' });
  assert.equal(await visual.getByRole('button', { name: '打开赛事助手' }).count(), 0);
  await displaySwitch.click();
  await page.getByRole('status').filter({ hasText: '已显示可视化页面的助手入口' }).waitFor();
  await visual.close();
  checks.push('display switch saves independently and restores on failure', 'visual launcher and open panel follow saved display setting');

  await page.locator('#assistant-model').fill('updated-model');
  await page.locator('#assistant-base-url').fill('https://api.example.com/v1/chat/completions');
  assert.equal(await page.getByRole('button', { name: '测试连接', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '配置已保存' }).waitFor();
  assert.equal(writes.length, 1); assert.equal(writes[0].apiKey, '');
  assert.equal(writes[0].maxTokens, 4096); assert.equal(writes[0].dotsThinking, 'off');
  assert.equal(await page.locator('#assistant-base-url').inputValue(), initial.baseUrl);
  assert.equal(await page.locator('#assistant-dots-thinking').count(), 0);
  checks.push('save normalized settings and preserve existing key', 'unsaved settings cannot test old model');

  failTest = true;
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '模型服务返回 400' }).waitFor();
  failTest = false;
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.locator('.test-result').waitFor();
  assert.match(await page.locator('.test-result').innerText(), /连接成功.*0\.8 秒/);
  assert.equal(await page.locator('.test-result script').count(), 0);
  assert.equal(tests, 2);
  await page.screenshot({ path: `${directory}/admin-desktop.png`, fullPage: true });
  checks.push('connection error recovery and safe test output');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '打开后台导航' }).click();
  await page.locator('.sidebar-nav').getByRole('link', { name: '赛事助手', exact: true }).click();
  // Clicking the already active route does not change the route watcher.
  if (await page.locator('.app-sidebar.mobile-open').count()) await page.getByRole('button', { name: '关闭后台导航' }).click();
  await page.waitForFunction(() => document.querySelector('.app-sidebar').getBoundingClientRect().right <= 1);
  const overflow = await page.locator('.assistant-admin').evaluate(root => [...root.querySelectorAll('input, select, button, .settings-panel')].some(el => {
    const r = el.getBoundingClientRect(); return r.width && (r.left < 0 || r.right > innerWidth + 1);
  }));
  assert.equal(overflow, false);
  await page.screenshot({ path: `${directory}/admin-mobile.png`, fullPage: true });
  await page.locator('.test-button').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${directory}/admin-mobile-test.png`, fullPage: true });
  checks.push('desktop and mobile navigation and layout');

  stored = {};
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
  assert.equal(await page.locator('#assistant-api-key').getAttribute('required'), '');
  await page.locator('#assistant-base-url').fill(initial.baseUrl);
  await page.locator('#assistant-model').fill('first-model');
  await page.locator('#assistant-api-key').fill('fixture-secret-value');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '配置已保存' }).waitFor();
  assert.equal(writes[1].apiKey, 'fixture-secret-value');
  assert.equal(await page.locator('#assistant-api-key').inputValue(), '');
  assert.doesNotMatch(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })), /fixture-secret-value/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  assert.equal(await page.locator('#assistant-model').inputValue(), 'first-model');
  assert.equal(await page.locator('#assistant-api-key').inputValue(), '');
  checks.push('first configuration', 'reload restores settings without revealing key');

  for (const code of [401, 403, 307]) {
    expiredStatus = code;
    await page.locator('#assistant-api-key').fill('fixture-secret-redirect');
    await page.getByRole('button', { name: '保存配置', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '后台登录已失效' }).waitFor();
    assert.equal(await page.locator('#assistant-model').isDisabled(), true);
    assert.equal(await page.locator('#assistant-api-key').inputValue(), '');
    assert.equal(writes.length, 2, 'failed login must not write settings');
    expiredStatus = 0;
    await page.getByRole('button', { name: '重新读取配置', exact: true }).click(); await ready();
  }
  assert.equal(loginRequests, 0, 'a 307 must never replay the config PUT to the login page');
  checks.push('login expiry and redirect never forward config secrets');

  offline = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.feedback[role="alert"]').filter({ hasText: '无法连接助手服务' }).waitFor();
  assert.equal(await page.locator('#assistant-model').isDisabled(), true);
  offline = false;
  await page.getByRole('button', { name: '重新读取配置', exact: true }).click(); await ready();
  offline = true;
  await page.getByRole('button', { name: '刷新状态', exact: true }).click();
  await page.getByText('服务未连接', { exact: true }).waitFor();
  offline = false;
  await page.getByRole('button', { name: '刷新状态', exact: true }).click();
  await page.getByText('服务在线', { exact: true }).waitFor();
  assert.deepEqual(businessReads, []);
  checks.push('service outage and retry', 'independent of business admin API');
  await context.close();

  // Verify real auto-loading and display persistence; never modify model settings.
  const real = await setupContext(), realPage = await real.newPage();
  const snapshot = await readFile(`${directory}/settings.json`, 'utf8');
  let realWrites = 0;
  await real.route('**/assistant/v1/**', async route => {
    if (route.request().method() !== 'GET' && !route.request().url().endsWith('/settings/display')) { realWrites++; return route.abort(); }
    return route.continue();
  });
  realPage.on('pageerror', e => errors.push(e.message));
  await realPage.goto(`${base}/data-manage/assistant`, { waitUntil: 'domcontentloaded' });
  await realPage.waitForFunction(() => {
    const input = document.querySelector('#assistant-model'); return input && !input.matches(':disabled');
  });
  assert.equal(await realPage.locator('#assistant-admin-token').count(), 0);
  assert.equal(await realPage.locator('#assistant-model').inputValue(), JSON.parse(snapshot).model);
  assert.equal(await realPage.locator('#assistant-api-key').inputValue(), '');
  const liveSwitch = realPage.getByRole('switch', { name: '在可视化页面显示助手' });
  await realPage.waitForFunction(() => { const control = document.querySelector('.display-switch'); return control && !control.disabled; });
  const originalDisplay = (await liveSwitch.getAttribute('aria-checked')) === 'true';
  try {
    await liveSwitch.click();
    await realPage.getByRole('status').filter({ hasText: originalDisplay ? '已隐藏可视化页面的助手入口' : '已显示可视化页面的助手入口' }).waitFor();
    await realPage.reload({ waitUntil: 'domcontentloaded' });
    await realPage.waitForFunction(() => { const control = document.querySelector('.display-switch'); return control && !control.disabled; });
    assert.equal(await liveSwitch.getAttribute('aria-checked'), String(!originalDisplay));
  } finally {
    const restored = await real.request.put(`${base}/assistant/v1/settings/display`, { data: { showInVisualize: originalDisplay } });
    assert.equal(restored.status(), 200);
  }
  await realPage.reload({ waitUntil: 'domcontentloaded' });
  await realPage.waitForFunction(() => { const control = document.querySelector('.display-switch'); return control && !control.disabled; });
  await realPage.screenshot({ path: `${directory}/admin-live.png`, fullPage: true });
  await realPage.goto(`${base}/assistant/v1/admin`, { waitUntil: 'domcontentloaded' });
  await realPage.waitForFunction(model => document.querySelector('#model')?.value === model, JSON.parse(snapshot).model);
  assert.equal(await realPage.locator('#token').count(), 0);
  assert.equal(await readFile(`${directory}/settings.json`, 'utf8'), snapshot);
  assert.equal(realWrites, 0); assert.deepEqual(errors, []);
  checks.push('real integrated and standalone pages auto-load without config writes');
  checks.push('real display switch persists across reload and is restored');
  await real.close();
  await writeFile(`${directory}/admin-browser-results.json`, JSON.stringify({ passed: true, checks, errors }, null, 2));
  console.log(`Assistant admin: ${checks.length} checks passed; real settings unchanged.`);
} finally { await browser.close(); }
