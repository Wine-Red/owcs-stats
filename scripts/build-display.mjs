import { readFile, writeFile, cp, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { verifyResources } from './lib/static-package.mjs';
import { validateSiteConfig } from '../src/services/siteClient.mjs';
import { embedDisplayPackage } from './lib/display-package.mjs';
const live = process.argv.includes('--api');
const output = live ? 'dist-api' : 'dist';
if (live) {
  const config = validateSiteConfig(JSON.parse(await readFile(process.env.OWCS_SITE_CONFIG || 'site-package.config.json', 'utf8')));
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'api-static'], { stdio: 'inherit' });
  for (const item of await readdir('public', { withFileTypes: true })) {
    if (item.name === 'static-data' || item.name.startsWith('.')) continue;
    await cp(`public/${item.name}`, `${output}/${item.name}`, { recursive: true });
  }
  await writeFile(`${output}/site-config.json`, `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(`${output}/DEPLOY.txt`, `OWCS Stats API-driven display package / 接口驱动展示包\n\nUpload index.html to an HTTP(S) static host. Hash routes support subdirectories.\nNo backend, proxy, login, cookie or API key is needed on the partner host. Voting is disabled.\nData is requested directly by the user's browser from ${config.apiBaseUrl}. Managed images use ${config.mediaOrigin}/media/.\nData changes need no new package; open or refresh the page to read data. There are no update prompts or automatic refreshes. An outage displays a retry notice.\nFrontend changes require a new complete package; this package never downloads remote JavaScript.\n\nOnly index.html is required at runtime: JS, CSS, fonts, local images and site configuration are embedded. No CDN asset CORS is required.\nKeep index.html on Cache-Control: no-cache. Other files are audit metadata, not runtime configuration. Do not extract/rewrite inline scripts or remove the matching CSP hash.\nChanging any API configuration requires regenerating the package with OWCS_SITE_CONFIG; embedded config and CSP update together.\nUse a new release directory, verify it, then switch traffic; keep the previous directory for rollback.\n\n运行只需 index.html，代码、样式、本地图标和接口配置均内置；其他文件仅供核对。更新比赛无需换包，前端或接口配置升级需重新构建并替换 HTML。\n详情使用 Hash 路由，无需 SPA 回退。托管平台需允许 CSP 中的接口和图片源。\n`);
} else {
  const manifest = JSON.parse(await readFile('public/static-data/manifest.json', 'utf8'));
  await verifyResources('public/static-data', manifest);
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'static'], { stdio: 'inherit' });
  await writeFile('dist/DEPLOY.txt', `OWCS Stats static display package\n\nUpload index.html to an HTTP(S) static host. JavaScript, CSS, fonts, images and compressed snapshot resources are embedded; data is decoded on demand. No Node.js, database, API proxy, login or CDN CORS is required.\nSubdirectories and hash-route refresh are supported. Other files are audit metadata. Keep index.html on Cache-Control: no-cache; preserve inline scripts and their CSP hash.\nThe package makes no external data/asset requests and contains no voting feature.\n\nData generated: ${manifest.generatedAt}\nDataset: ${manifest.datasetId}\nData mode: ${manifest.exportMode}\n\nTo update, upload a complete new release directory, verify it, then switch the site to it.\nDo not overlay a partial upload on the currently served directory. Keep the previous release for rollback.\n`);
}
await writeFile(`${output}/package-manifest.json`, `${JSON.stringify({ schemaVersion: 1, mode: live ? 'api' : 'snapshot',
  apiVersion: live ? 1 : undefined, delivery: 'embedded-html', builtAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim()),
  configFile: live ? 'site-config.json' : undefined, capabilities: { readOnly: true, voting: false, bundledData: !live } }, null, 2)}\n`);
await embedDisplayPackage(output);
