// Native HTTP servers reproduce a page host that redirects all sidecar files to
// a different-origin CDN with no CORS. No browser request interception is used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { openDisplayPackage } from './lib/display-package.mjs';
import { launchBrowser } from './lib/browser.mjs';

const live = process.argv.includes('--api');
const bundle = await openDisplayPackage(live ? 'dist-api' : 'dist');
const config = live ? bundle.json('site-config.json') : null;
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const cdnRequests = [];
const cdn = createServer((req, res) => {
  cdnRequests.push(req.url);
  res.writeHead(200, { 'Content-Type': 'text/javascript' });
  res.end('window.cdnModuleLoaded = true;');
});
const cdnOrigin = await listen(cdn);
// A real platform rewrites external src/href paths. Embedded scripts, styles,
// fonts, images and data have no such paths left to rewrite.
const html = bundle.html.replace(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)|((?:src|href)=")\.\/([^"]+)"/g,
  (_match, inline, attr, file) => inline || `${attr}${cdnOrigin}/_assets/${file}"`);
const compressed = gzipSync(html);
const host = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://host.invalid').pathname;
  if (pathname === '/negative.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<link rel="icon" href="data:,"><script type="module" src="${cdnOrigin}/probe.js"></script>`);
  }
  if (['/', '/index.html', '/partner/owcs/', '/partner/owcs/index.html'].includes(pathname)) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' });
    return res.end(compressed);
  }
  res.writeHead(302, { Location: `${cdnOrigin}/_assets${pathname}` }); res.end();
});
const hostOrigin = await listen(host);
const browser = await launchBrowser();
try {
  const negative = await browser.newPage();
  const blocked = negative.waitForEvent('requestfailed', request => request.url() === `${cdnOrigin}/probe.js`);
  await negative.goto(`${hostOrigin}/negative.html`);
  await blocked;
  assert.equal(await negative.evaluate(() => window.cdnModuleLoaded), undefined);
  assert.ok(cdnRequests.includes('/probe.js'), 'negative control must reach the CDN and fail browser CORS');
  await negative.close();
  cdnRequests.length = 0;
  for (const [width, prefix] of [[1440, '/'], [390, '/partner/owcs/']]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], unexpected = [];
    const pendingHttp = new Set();
    // Wait for actual HTTP work before navigating; local Blob URLs need no CDN
    // response and are checked separately by image.decode() and canvas export.
    const settleHttp = async () => {
      const deadline = Date.now() + 60000;
      while (pendingHttp.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
      assert.deepEqual([...pendingHttp].map(request => request.url()), [], 'HTTP requests must finish before reload/close');
    };
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfinished', request => pendingHttp.delete(request));
    page.on('requestfailed', request => { pendingHttp.delete(request); errors.push(`${request.url()} ${request.failure()?.errorText}`); });
    page.on('request', request => {
      if (!/^https?:/.test(request.url())) return;
      pendingHttp.add(request);
      const url = new URL(request.url());
      if (url.origin === hostOrigin && request.resourceType() === 'document') return;
      if (live && (url.href.startsWith(`${config.apiBaseUrl}/`) || (url.origin === config.mediaOrigin && url.pathname.startsWith('/media/')))) return;
      unexpected.push(url.href);
    });
    await page.goto(`${hostOrigin}${prefix}index.html#/visualize`, { waitUntil: 'domcontentloaded' });
    await page.locator('.vis-body').waitFor({ timeout: 60000 });
    await page.getByRole('tab', { name: '赛程列表', exact: true }).click();
    await page.locator('.schedule-shell').waitFor({ timeout: 60000 });
    const image = page.locator('img[src^="blob:"]').first();
    // The desktop brand mark is hidden on mobile but still used by exports.
    await image.waitFor({ state: 'attached' });
    const canvasOk = await image.evaluate(async node => {
      await node.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      canvas.getContext('2d').drawImage(node, 0, 0, 32, 32);
      return node.naturalWidth > 0 && canvas.toDataURL().startsWith('data:image/png');
    });
    assert.ok(canvasOk, 'embedded images must support canvas export');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await settleHttp();
    await page.reload();
    await page.locator('.vis-body').waitFor({ timeout: 60000 });
    await settleHttp();
    assert.equal(await page.locator('.match-support').count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await page.close();
    console.log(`[partner-host] PASS ${live ? 'API' : 'snapshot'} ${width}px ${prefix}: HTML only, schedule, image/canvas, reload`);
  }
  assert.deepEqual(cdnRequests, [], 'fixed package must never request the no-CORS CDN');
} finally {
  await browser.close();
  for (const server of [host, cdn]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
