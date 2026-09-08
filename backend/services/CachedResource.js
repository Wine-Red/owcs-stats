const createCachedResource = ({ ttlMs, loader, maxWaitMs = 0 }) => {
  const entries = new Map();

  const waitForLoad = async (promise, current) => {
    if (!maxWaitMs) return promise;
    let timer;
    try {
      return await Promise.race([promise, new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Cached resource refresh timed out');
          if (current.data) resolve({ data: current.data, cached: true, stale: true, error: error.message, observedAt: current.timestamp });
          else reject(error);
        }, maxWaitMs);
      })]);
    } finally { clearTimeout(timer); }
  };

  const get = async key => {
    const cacheKey = String(key || 'default');
    const now = Date.now();
    const current = entries.get(cacheKey) || { data: null, timestamp: 0, promise: null };

    if (current.data && now - current.timestamp < ttlMs) {
      return { data: current.data, cached: true, stale: false, observedAt: current.timestamp };
    }
    if (current.promise) return waitForLoad(current.promise, current);

    current.promise = loader(key)
      .then(data => {
        const timestamp = Date.now();
        entries.set(cacheKey, { data, timestamp, promise: null });
        return { data, cached: false, stale: false, observedAt: timestamp };
      })
      .catch(error => {
        current.promise = null;
        entries.set(cacheKey, current);
        if (current.data) {
          return { data: current.data, cached: true, stale: true, error: error.message, observedAt: current.timestamp };
        }
        throw error;
      });

    entries.set(cacheKey, current);
    // A caller timeout does not enqueue another source request. The existing
    // load stays coalesced and may refresh the cache when it eventually ends.
    return waitForLoad(current.promise, current);
  };

  return { get };
};

module.exports = { createCachedResource };
