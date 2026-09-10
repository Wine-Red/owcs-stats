/* global globalThis */
import { reactive } from 'vue';
import { createSiteClient, validateSiteConfig } from './siteClient.mjs';

export const siteStatus = reactive({ error: '', updateAvailable: false, scheduleStale: false, revision: '' });
let configPromise;
const failedPaths = new Map();
export const loadSiteConfig = () => {
  if (!configPromise) configPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}site-config.json`, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error('页面配置加载失败，请重试');
      return { ...validateSiteConfig(await response.json()), assetBaseUrl: new URL(import.meta.env.BASE_URL, globalThis.location.href).href };
    } finally { clearTimeout(timer); }
  })().catch(error => { configPromise = null; siteStatus.error = error.message; throw error; });
  return configPromise;
};
export const siteApi = createSiteClient({ getConfig: loadSiteConfig, notify(event) {
  if (event.type === 'error') failedPaths.set(event.path, event.message);
  else failedPaths.delete(event.path);
  siteStatus.error = failedPaths.values().next().value || '';
} });

export const resetSiteData = () => {
  siteApi.clear(); failedPaths.clear(); siteStatus.error = ''; siteStatus.updateAvailable = false; siteStatus.revision = '';
};
export const watchSiteUpdates = () => {
  let stopped = false, busy = false, timer;
  const check = async () => {
    if (stopped || busy || document.visibilityState === 'hidden') return;
    busy = true;
    try {
      const meta = await siteApi.get('/meta', { fresh: true });
      if (stopped) return;
      if (meta.apiVersion !== 1 || !meta.revision) throw new Error('数据接口版本不兼容，请更新页面包');
      if (siteStatus.revision && siteStatus.revision !== meta.revision) siteStatus.updateAvailable = true;
      if (!siteStatus.revision) siteStatus.revision = meta.revision;
      siteStatus.scheduleStale = Boolean(meta.schedule?.stale);
    } catch (error) {
      if (!stopped) { failedPaths.set('/meta', error.message); siteStatus.error = error.message; }
    }
    finally { busy = false; }
  };
  loadSiteConfig().then(config => {
    if (stopped) return;
    check(); timer = setInterval(check, config.refreshIntervalMs);
  }).catch(() => {});
  document.addEventListener('visibilitychange', check);
  globalThis.addEventListener('online', check);
  return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', check); globalThis.removeEventListener('online', check); };
};
