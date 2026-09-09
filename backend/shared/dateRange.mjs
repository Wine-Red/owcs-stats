// Date-only map-game filters use UTC calendar days, matching serialized createdAt.
// An explicit timestamp remains an inclusive instant; a date-only end includes
// the whole day via an exclusive next-midnight boundary (no precision truncation).
const invalid = () => Object.assign(new Error('日期筛选参数不合法'), { statusCode: 400 });
const parseBoundary = value => {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const time = Date.parse(dateOnly ? `${text}T00:00:00.000Z` : text);
  if (!Number.isFinite(time) || (dateOnly && new Date(time).toISOString().slice(0, 10) !== text)) throw invalid();
  return { time, dateOnly };
};

export const timestampRange = ({ startDate, endDate } = {}) => {
  const start = parseBoundary(startDate), end = parseBoundary(endDate);
  const range = { start: start?.time ?? null, end: end ? end.time + (end.dateOnly ? 86400000 : 0) : null, endExclusive: end?.dateOnly || false };
  if (range.start !== null && range.end !== null
    && (range.endExclusive ? range.start >= range.end : range.start > range.end)) throw invalid();
  return range;
};

export const withinTimestampRange = (value, range) => {
  if (range.start === null && range.end === null) return true;
  const time = value == null || value === '' ? NaN : new Date(value).getTime();
  return Number.isFinite(time) && (range.start === null || time >= range.start)
    && (range.end === null || (range.endExclusive ? time < range.end : time <= range.end));
};
