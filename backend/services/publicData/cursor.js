const crypto = require('node:crypto');
const { invalid, PublicDataError } = require('./errors');
const { isDate } = require('./parameters');

const canonical = object => JSON.stringify(Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b))));
const createCursorCodec = ({ secret = process.env.DATA_API_CURSOR_SECRET || crypto.randomBytes(32), now = Date.now } = {}) => {
  if (Buffer.byteLength(secret) < 32) throw new Error('DATA_API_CURSOR_SECRET must contain at least 32 bytes.');
  const sign = text => crypto.createHmac('sha256', secret).update(text).digest('base64url');
  const binding = (scope, query) => crypto.createHash('sha256').update(canonical({ version: 1, scope, ...query, cursor: undefined })).digest('hex');
  const decode = (token, scope, query) => {
    if (!token) return null;
    let payload;
    try {
      const [text, mac, extra] = token.split('.');
      if (extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(text) || !/^[A-Za-z0-9_-]{43}$/.test(mac)) throw new Error();
      if (!crypto.timingSafeEqual(Buffer.from(sign(text)), Buffer.from(mac))) throw new Error();
      payload = JSON.parse(Buffer.from(text, 'base64url').toString());
      if (payload.v !== 1 || payload.query !== binding(scope, query) || !Number.isSafeInteger(payload.exp)
        || !Number.isSafeInteger(payload.after?.id) || payload.after.id < 1
        || (scope === 'matches' && !isDate(payload.after.date))) throw new Error();
    } catch (_error) { throw invalid('cursor is invalid or belongs to a different query.'); }
    if (payload.exp <= now()) throw new PublicDataError(410, 'CURSOR_EXPIRED', 'Cursor has expired; restart from the first page.');
    return payload;
  };
  const encode = (after, scope, query, previous) => {
    // Stable within a UTC day, so unchanged first pages have reusable ETags.
    // Subsequent pages retain the original traversal expiry (24–48 hours).
    const exp = previous?.exp ?? (Math.floor(now() / 86400000) + 2) * 86400000;
    const text = Buffer.from(JSON.stringify({ v: 1, query: binding(scope, query), after, exp })).toString('base64url');
    return `${text}.${sign(text)}`;
  };
  return { decode, encode };
};

module.exports = { createCursorCodec };
