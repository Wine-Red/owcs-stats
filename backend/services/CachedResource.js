const createCachedResource = ({ ttlMs, loader }) => {
  const entries = new Map();

  const get = async key => {
    const cacheKey = String(key || 'default');
    const now = Date.now();
    const current = entries.get(cacheKey) || { data: null, timestamp: 0, promise: null };

    if (current.data && now - current.timestamp < ttlMs) {
      return { data: current.data, cached: true, stale: false };
    }
    if (current.promise) return current.promise;

    current.promise = loader(key)
      .then(data => {
        entries.set(cacheKey, { data, timestamp: Date.now(), promise: null });
        return { data, cached: false, stale: false };
      })
      .catch(error => {
        current.promise = null;
        entries.set(cacheKey, current);
        if (current.data) {
          return { data: current.data, cached: true, stale: true, error: error.message };
        }
        throw error;
      });

    entries.set(cacheKey, current);
    return current.promise;
  };

  return { get };
};

module.exports = { createCachedResource };
