const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');

const LIQUIPEDIA_API_BASE = 'https://liquipedia.net/overwatch/api.php';
const USER_AGENT = 'OWCSStats/1.0 (Server-Side Proxy; admin@owmini.xyz)';
const PARSE_INTERVAL_MS = Number(process.env.LIQUIPEDIA_PARSE_INTERVAL_MS) || 30000;

let parseQueue = Promise.resolve();
let lastParseStartedAt = 0;

const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

const requestJson = async (apiUrl) => new Promise((resolve, reject) => {
  const url = new URL(apiUrl);
  const request = https.get({
    hostname: url.hostname,
    path: url.pathname + url.search,
    family: 4,
    timeout: 30000,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Encoding': 'gzip'
    }
  }, response => {
    const chunks = [];
    const stream = response.headers['content-encoding'] === 'gzip'
      ? response.pipe(zlib.createGunzip())
      : response;

    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`Liquipedia API returned status ${response.statusCode}`));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Failed to parse Liquipedia API response'));
      }
    });
    stream.on('error', reject);
  });

  request.on('error', reject);
  request.on('timeout', () => {
    request.destroy();
    reject(new Error('Liquipedia API request timed out'));
  });
});

const scheduleParse = task => {
  const run = async () => {
    const remaining = PARSE_INTERVAL_MS - (Date.now() - lastParseStartedAt);
    if (remaining > 0) await wait(remaining);
    lastParseStartedAt = Date.now();
    return task();
  };
  const result = parseQueue.then(run, run);
  parseQueue = result.catch(() => undefined);
  return result;
};

const fetchParsedHtml = async ({ page, text }) => scheduleParse(async () => {
  const params = new URLSearchParams({
    action: 'parse',
    format: 'json',
    prop: 'text|revid'
  });
  if (page) params.set('page', page);
  if (text) {
    params.set('contentmodel', 'wikitext');
    params.set('text', text);
  }

  const data = await requestJson(`${LIQUIPEDIA_API_BASE}?${params.toString()}`);
  return {
    html: data?.parse?.text?.['*'] || '',
    title: data?.parse?.title || page || '',
    revisionId: data?.parse?.revid || null
  };
});

module.exports = {
  LIQUIPEDIA_API_BASE,
  fetchParsedHtml,
  requestJson
};
