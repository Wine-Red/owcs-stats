const LIQUIPEDIA_BASE_URL = 'https://liquipedia.net';
const OVERWATCH_PATH_PREFIX = '/overwatch/';

const decodePagePart = value => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizePageName = value => decodePagePart(String(value || ''))
  .replace(/\\/g, '/')
  .replace(/[ _]+/g, '_')
  .replace(/\/{2,}/g, '/')
  .replace(/^\/+|\/+$/g, '')
  .toLowerCase();

const parseLiquipediaUrl = value => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw, LIQUIPEDIA_BASE_URL);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname !== 'liquipedia.net') return null;

  const pathname = url.pathname.replace(/\/{2,}/g, '/');
  let pageName = '';
  if (pathname.toLowerCase() === '/overwatch/index.php') {
    pageName = url.searchParams.get('title') || '';
  } else if (pathname.toLowerCase().startsWith(OVERWATCH_PATH_PREFIX)) {
    pageName = pathname.slice(OVERWATCH_PATH_PREFIX.length);
  }

  const normalizedPageName = decodePagePart(String(pageName || ''))
    .replace(/\\/g, '/')
    .replace(/[ _]+/g, '_')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const pageKey = normalizePageName(normalizedPageName);
  return pageKey ? { pageKey, pageName: normalizedPageName } : null;
};

const encodePageName = pageKey => pageKey
  .split('/')
  .map(part => encodeURIComponent(part))
  .join('/');

export const getLiquipediaTournamentPageKey = value => (
  parseLiquipediaUrl(value)?.pageKey || ''
);

export const isValidLiquipediaTournamentUrl = value => {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) && !!parseLiquipediaUrl(url.href);
  } catch {
    return false;
  }
};

export const normalizeLiquipediaTournamentUrl = value => {
  const parsed = parseLiquipediaUrl(value);
  if (!parsed) return '';
  return `${LIQUIPEDIA_BASE_URL}${OVERWATCH_PATH_PREFIX}${encodePageName(parsed.pageName)}`;
};

export const isLiquipediaTournamentMatch = (matchUrl, tournamentUrl) => {
  if (!isValidLiquipediaTournamentUrl(tournamentUrl)) return false;
  const matchPageKey = getLiquipediaTournamentPageKey(matchUrl);
  const tournamentPageKey = getLiquipediaTournamentPageKey(tournamentUrl);
  if (!matchPageKey || !tournamentPageKey) return false;
  return matchPageKey === tournamentPageKey;
};
