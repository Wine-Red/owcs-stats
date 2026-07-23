const STATIC_ASSET_TOKEN = '__OWCS_STATIC_BASE__/';

const canonicalKey = (path, params) => {
  const [pathname, existingQuery = ''] = String(path).split('?');
  const query = new URLSearchParams(existingQuery);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, Array.isArray(value) ? value.join(',') : String(value));
  });
  query.sort();

  const queryString = query.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
};

const cloneWithLocalAssets = value => {
  if (typeof value === 'string') {
    return value.startsWith(STATIC_ASSET_TOKEN)
      ? `${import.meta.env.BASE_URL}${value.slice(STATIC_ASSET_TOKEN.length)}`
      : value;
  }
  if (Array.isArray(value)) return value.map(cloneWithLocalAssets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneWithLocalAssets(item)])
    );
  }
  return value;
};

let snapshotPromise;

const loadSnapshot = async () => {
  if (!snapshotPromise) {
    const snapshotUrl = `${import.meta.env.BASE_URL}static-data/api-cache.json`;
    snapshotPromise = fetch(snapshotUrl, { cache: 'no-cache' }).then(async response => {
      if (!response.ok) {
        throw new Error(`静态数据快照加载失败 (${response.status}): ${snapshotUrl}`);
      }
      const snapshot = await response.json();
      if (!snapshot || snapshot.schemaVersion !== 1 || !snapshot.responses) {
        throw new Error('静态数据快照格式不受支持，请重新执行 npm run export:static');
      }
      return snapshot;
    });
  }
  return snapshotPromise;
};

const createReadOnlyError = method => {
  const error = new Error(`静态展示版不支持 ${method.toUpperCase()} 写操作`);
  error.code = 'STATIC_READ_ONLY';
  error.response = { status: 405 };
  return error;
};

export default function createStaticApi() {
  return {
    async get(path, config = {}) {
      const snapshot = await loadSnapshot();
      const key = canonicalKey(path, config.params);
      if (!Object.prototype.hasOwnProperty.call(snapshot.responses, key)) {
        const error = new Error(`静态快照缺少接口数据: GET ${key}`);
        error.code = 'STATIC_DATA_MISSING';
        error.response = { status: 404 };
        throw error;
      }
      return cloneWithLocalAssets(snapshot.responses[key]);
    },
    post() {
      return Promise.reject(createReadOnlyError('post'));
    },
    put() {
      return Promise.reject(createReadOnlyError('put'));
    },
    delete() {
      return Promise.reject(createReadOnlyError('delete'));
    }
  };
}

export { canonicalKey };
