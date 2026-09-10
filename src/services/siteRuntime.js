/* global globalThis */
import { reactive } from 'vue';
import { createSiteClient, validateSiteConfig } from './siteClient.mjs';
import { embeddedPackage } from './embeddedPackage.mjs';
import { packageAssetUrl } from '../utils/packageAssets';

export const siteStatus = reactive({ error: '', updateAvailable: false, scheduleStale: false, revision: '' });
let configPromise;
const failedPaths = new Map();
export const loadSiteConfig = () => {
  if (!configPromise) configPromise = (async () => {
    return { ...validateSiteConfig(embeddedPackage().json('site-config.json')),
      assetBaseUrl: new URL(import.meta.env.BASE_URL, globalThis.location.href).href, resolveLocalAsset: packageAssetUrl };
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
