const failure = (message, status = 0) => Object.assign(new Error(message), { response: { status } });
export const validateSiteConfig = config => {
  if (config?.schemaVersion !== 1) throw failure('页面配置版本不兼容，请更新部署包');
  for (const key of ['apiBaseUrl', 'mediaOrigin']) {
    const url = new URL(config[key]);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      || url.username || url.password || url.search || url.hash) throw failure(`页面配置无效：${key}`);
    if (key === 'mediaOrigin' && url.pathname !== '/') throw failure('mediaOrigin 必须是源地址');
  }
  if (!/\/site\/v1\/?$/.test(new URL(config.apiBaseUrl).pathname)) throw failure('需要 v1 展示接口');
  for (const [key, min, max] of [['refreshIntervalMs', 15000, 3600000], ['timeoutMs', 1000, 120000]]) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) throw failure(`页面配置无效：${key}`);
  }
  return { ...config, apiBaseUrl: config.apiBaseUrl.replace(/\/$/, ''), mediaOrigin: new URL(config.mediaOrigin).origin };
};

export const resolveSiteMedia = (value, { mediaOrigin, assetBaseUrl }, key = '') => {
  if (typeof value === 'string' && /^(?:logo|image|icon|avatar|banner|backgroundImage|cover)(?:Url)?$/i.test(key)) {
    if (value.startsWith('/media/')) return `${mediaOrigin}${value}`;
    if (/^\/?(?:heroes|maps|icons|branding)\//.test(value)) return new URL(value.replace(/^\//, ''), assetBaseUrl).href;
    if (/^(?:https?:)?\/\//.test(value)) {
      const url = new URL(value, mediaOrigin);
      // Old absolute first-party paths use the same media boundary as new uploads.
      if (url.origin === mediaOrigin) return url.href;
      // Unmanaged external images cannot guarantee CORS or export-to-canvas.
      return '';
    }
    return '';
  }
  if (Array.isArray(value)) return value.map(item => resolveSiteMedia(item, { mediaOrigin, assetBaseUrl }));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, resolveSiteMedia(item, { mediaOrigin, assetBaseUrl }, name)]));
  return value;
};

export const createSiteClient = ({ getConfig, fetcher = fetch, now = Date.now, notify = () => {} }) => {
  const pending = new Map(), cache = new Map();
  let generation = 0;
  const json = async (url, config) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetcher(url, { credentials: 'omit', mode: 'cors', cache: 'no-cache',
        headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw failure(response.status === 429 ? '请求较多，请稍后重试' : '数据暂时无法加载，请重试', response.status);
      if (!response.headers.get('content-type')?.includes('application/json')) throw failure('数据服务返回异常，请重试');
      return await response.json();
    } finally { clearTimeout(timer); }
  };
  const get = async (path, options = {}) => {
    if (!/^\/[a-z0-9/_-]+$/i.test(path) || path.includes('..')) throw failure('不支持的接口路径', 400);
    const config = await getConfig();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params || {}).sort()) if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    const url = `${config.apiBaseUrl}${path}${params.size ? `?${params}` : ''}`;
    const stored = cache.get(url);
    if (!options.fresh && stored?.until > now()) return structuredClone(stored.data);
    if (!pending.has(url)) {
      const started = generation;
      const task = json(url, config).then(body => {
        const data = resolveSiteMedia(body, config);
        if (started === generation) {
          if (cache.size >= 128) cache.delete(cache.keys().next().value);
          cache.set(url, { data, until: now() + 15000 });
          notify({ type: 'success', path });
        }
        return data;
      }).catch(error => {
        // Optional missing entities remain local errors, not connection failures.
        if (started === generation && (!error.response?.status || error.response.status >= 500 || error.response.status === 429)) notify({ type: 'error', path, message: error.message });
        throw error;
      }).finally(() => { if (pending.get(url) === task) pending.delete(url); });
      pending.set(url, task);
    }
    return structuredClone(await pending.get(url));
  };
  const readonly = () => Promise.reject(failure('展示版不支持写操作', 405));
  return { get, post: readonly, put: readonly, patch: readonly, delete: readonly,
    clear() { generation++; cache.clear(); pending.clear(); } };
};
