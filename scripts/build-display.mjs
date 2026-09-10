import { readFile, writeFile, cp, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { verifyResources } from './lib/static-package.mjs';
import { validateSiteConfig } from '../src/services/siteClient.mjs';
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
  await writeFile(`${output}/package-manifest.json`, `${JSON.stringify({ schemaVersion: 1, mode: 'api', apiVersion: 1,
    builtAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim()),
    configFile: 'site-config.json', capabilities: { readOnly: true, voting: false, bundledData: false } }, null, 2)}\n`);
  await writeFile(`${output}/DEPLOY.txt`, `OWCS Stats API-driven display package / 接口驱动展示包\n\nUpload ALL files to an HTTP(S) static host, preserving directories. Hash routes support subdirectories.\nNo backend, proxy, login, cookie or API key is needed on the partner host. Voting is disabled.\nData is requested directly by the user's browser from ${config.apiBaseUrl}. Managed images use ${config.mediaOrigin}/media/.\nData changes need no new package; the page checks periodically and offers refresh. An outage displays a retry notice.\nFrontend changes require a new complete package; this package never downloads remote JavaScript.\n\nKeep index.html, site-config.json and package-manifest.json on Cache-Control: no-cache. Cache hashed assets as immutable.\nChanging trusted origins requires regenerating the package with OWCS_SITE_CONFIG, which also generates CSP.\nUse a new release directory, verify it, then switch traffic; keep the previous directory for rollback.\n\n上传全部文件并保持目录结构；数据从接口获取，更新比赛无需换包。前端升级需替换完整新包。\n详情使用 Hash 路由，无需 SPA 回退。托管平台需允许 CSP 中的接口和图片源。\n`);
} else {
  const manifest = JSON.parse(await readFile('public/static-data/manifest.json', 'utf8'));
  await verifyResources('public/static-data', manifest);
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'static'], { stdio: 'inherit' });
  await writeFile('dist/DEPLOY.txt', `OWCS Stats static display package\n\nUpload ALL files to an HTTP(S) static host. No Node.js, database, API proxy or login is required.\nSubdirectories and hash-route refresh are supported. Keep the directory structure intact.\nThe package makes no external data/asset requests and contains no voting feature.\n\nData generated: ${manifest.generatedAt}\nDataset: ${manifest.datasetId}\nData mode: ${manifest.exportMode}\n\nTo update, upload a complete new release directory, verify it, then switch the site to it.\nDo not overlay a partial upload on the currently served directory. Keep the previous release for rollback.\n`);
}
