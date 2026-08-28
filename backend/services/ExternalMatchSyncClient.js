const DEFAULT_BASE_URL = 'https://match.owmini.xyz';
const DEFAULT_TIMEOUT_MS = 60_000;

const normalizeBaseUrl = (value) => String(value || DEFAULT_BASE_URL).replace(/\/+$/, '');

const validateSummary = (payload) => {
  if (!payload || payload.schemaVersion !== 2 || !Array.isArray(payload.items)) {
    throw new Error('External match sync summary has an unsupported schema');
  }
  for (const item of payload.items) {
    if (!item || !['upsert', 'delete'].includes(item.operation) || !item.id) {
      throw new Error('External match sync summary contains an invalid item');
    }
  }
  if (payload.hasMore && !payload.nextCursor) {
    throw new Error('External match sync summary is missing nextCursor');
  }
  return payload;
};

const validateDetail = (payload, expectedId) => {
  if (!payload || payload.schemaVersion !== 2 || !payload.match) {
    throw new Error(`External match detail ${expectedId} has an unsupported schema`);
  }
  if (String(payload.match.id) !== String(expectedId)) {
    throw new Error(`External match detail ID mismatch: expected ${expectedId}, received ${payload.match.id}`);
  }
  return payload.match;
};

const createExternalMatchSyncClient = ({
  baseUrl = process.env.EXTERNAL_MATCH_API_BASE || DEFAULT_BASE_URL,
  headers = {},
  fetchImpl = global.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');

  const requestJson = async (path) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}${path}`, {
        method: 'GET', headers, signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`External match API request failed: ${response.status} ${response.statusText}`);
      }
      try {
        return await response.json();
      } catch (error) {
        const contentType = response.headers?.get?.('content-type') || 'unknown content type';
        const finalUrl = response.url && response.url !== `${normalizeBaseUrl(baseUrl)}${path}`
          ? ` after redirect to ${response.url}`
          : '';
        throw new Error(`External match API returned invalid JSON (${contentType})${finalUrl}`);
      }
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('External match API request timed out');
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return {
    async fetchChanges({ cursor = null, limit = 50 } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return validateSummary(await requestJson(`/api/sync/matches?${params.toString()}`));
    },
    async fetchMatch(id) {
      return validateDetail(
        await requestJson(`/api/sync/matches/${encodeURIComponent(String(id))}`),
        id
      );
    }
  };
};

module.exports = { DEFAULT_BASE_URL, createExternalMatchSyncClient, validateSummary, validateDetail };
