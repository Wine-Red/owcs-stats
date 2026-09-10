import { readStaticData, STATIC_SCHEMA_VERSION, staticError } from './staticSnapshot.mjs';
import { embeddedPackage } from './embeddedPackage.mjs';
const token = '__OWCS_STATIC_BASE__/';
const resources = new Map();
const json = async path => embeddedPackage().json(`static-data/${path}`);
let manifestPromise;
export const loadStaticManifest = () => {
  if (!manifestPromise) manifestPromise = json('manifest.json').then(manifest => {
    if (manifest.schemaVersion !== STATIC_SCHEMA_VERSION || !manifest.files) throw staticError('静态数据格式不兼容，请更新完整部署包');
    return manifest;
  }).catch(error => { manifestPromise = null; throw error; });
  return manifestPromise;
};
const localAssets = value => {
  if (typeof value === 'string') return value.startsWith(token) ? embeddedPackage().asset(value.slice(token.length)) : value;
  if (Array.isArray(value)) return value.map(localAssets);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localAssets(item)]));
  return value;
};
const load = async name => {
  if (!resources.has(name)) resources.set(name, loadStaticManifest().then(async manifest => {
    const descriptor = manifest.files[name];
    if (!descriptor || !/^data\/[a-zA-Z0-9._/-]+\.json$/.test(descriptor.path) || descriptor.path.includes('..')) throw staticError(`静态资源缺失: ${name}`);
    return json(descriptor.path);
  }).catch(error => { resources.delete(name); throw error; }));
  return resources.get(name);
};
const readonly = () => Promise.reject(Object.assign(new Error('静态展示版不支持写操作'), { code: 'STATIC_READ_ONLY', response: { status: 405 } }));
export default function createStaticApi() {
  return { get: async (path, config = {}) => localAssets(await readStaticData(load, path, config.params)),
    post: readonly, put: readonly, patch: readonly, delete: readonly };
}
