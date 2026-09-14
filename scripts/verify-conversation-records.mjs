import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from './lib/browser.mjs';
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const record = { id: '11111111-1111-4111-8111-111111111111', text: '测试用户的问题', answer: '<script>window.recordXss=true</script>测试回答', recordedAt: new Date().toISOString(), status: 'completed', model: 'test-model', metrics: { input_tokens: 12, output_tokens: 4 }, history: [], page: {} };
  let deleted = false;
  await page.route('**/assistant/v1/**', async route => {
    const p = new URL(route.request().url()).pathname;
    let data;
    if (p.endsWith('/status')) data = { configured: false, showInVisualize: true };
    else if (p.endsWith('/settings')) data = {};
    else if (p.endsWith('/conversations')) data = { items: deleted ? [] : [record], total: deleted ? 0 : 1, offset: 0, limit: 25, retentionDays: 90, maxRecords: 2000 };
    else if (p.endsWith(record.id)) { if (route.request().method() === 'DELETE') deleted = true; data = deleted ? { ok: true } : record; }
    else throw new Error(p);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto((process.env.ASSISTANT_WEB_URL || 'http://127.0.0.1:8080') + '/data-manage/assistant');
  await page.getByRole('button', { name: /测试用户的问题/ }).click();
  await page.getByRole('heading', { name: '问答详情' }).waitFor();
  assert.equal(await page.evaluate(() => window.recordXss), undefined);
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '导出本页 JSON' }).click();
  const download = await downloadPromise; const exported = JSON.parse(await readFile(await download.path(), 'utf8')); assert.equal(exported[0].answer, record.answer);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '删除这条记录' }).click();
  await page.getByText('暂无记录，启用后收到的新对话会显示在这里。').waitFor(); assert.equal(deleted, true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log('Conversation UI passed: mobile detail, escaped text, JSON export and deletion.');
} finally { await browser.close(); }
