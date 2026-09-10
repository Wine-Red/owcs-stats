/* global globalThis */
import { reactive } from 'vue';
import { createSiteClient, validateSiteConfig } from './siteClient.mjs';
import { embeddedPackage } from './embeddedPackage.mjs';
import { packageAssetUrl } from '../utils/packageAssets';

export const siteStatus = reactive({ error: '' });
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
  siteApi.clear(); failedPaths.clear(); siteStatus.error = '';
};
