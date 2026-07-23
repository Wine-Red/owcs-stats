const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const responseError = async response => {
  let body = '';
  try {
    body = (await response.text()).slice(0, 300);
  } catch {
    // Preserve the HTTP status even if reading the error response fails.
  }

  const error = new Error(
    `${response.status} ${response.statusText}${body ? ` - ${body}` : ''}`
  );
  error.status = response.status;
  return error;
};

const isRetryable = error => (
  error?.status === undefined || RETRYABLE_HTTP_STATUSES.has(error.status)
);

const fetchJsonWithRetry = async (url, {
  fetchImpl = fetch,
  attempts = 5,
  timeoutMs = 120_000,
  baseDelayMs = 1_000,
  maxDelayMs = 8_000,
  sleepImpl = sleep,
  onRetry = () => {}
} = {}) => {
  const maxAttempts = Math.max(1, Math.trunc(Number(attempts)) || 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw await responseError(response);
      return await response.json();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryable(error)) throw error;

      const delayMs = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
      onRetry({
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        delayMs,
        error,
        url
      });
      await sleepImpl(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Request failed without an error: ${url}`);
};

export { RETRYABLE_HTTP_STATUSES, fetchJsonWithRetry };
