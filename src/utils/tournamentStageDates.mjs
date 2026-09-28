const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthPattern = months.map(month => `${month.slice(0, 3)}(?:${month.slice(3)})?\\.?`).join('|');
const englishRange = new RegExp(`^(${monthPattern})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?(?:\\s*(?:-|to)\\s*(?:(${monthPattern})\\s+)?(\\d{1,2})(?:,?\\s+(\\d{4}))?)?$`, 'i');
const monthNumber = name => months.findIndex(month => month.startsWith(name.toLowerCase().replace(/\.$/, ''))) + 1;
const calendarDate = (year, month, day) => {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export function tournamentYear(snapshot) {
  const path = snapshot?.page || snapshot?.sourceUrl || '';
  const years = [...new Set(String(path).replace(/_/g, ' ').match(/\b(?:19|20)\d{2}\b/g) || [])];
  return years.length === 1 ? Number(years[0]) : null;
}

// Read calendar days, without converting them through the browser's time zone.
// A date belongs to its explicitly named Format stage, not to its first/last
// currently known match (which may only be a partial schedule).
export function parseStageDateRange(original, eventYear) {
  const value = String(original || '');
  const colon = value.indexOf(':');
  if (colon < 0) return null;
  const text = value.slice(colon + 1).replace(/\[\d+\]/g, '').replace(/[\u2010-\u2014]/g, '-')
    .replace(/(\d)\s*(?:st|nd|rd|th)\b/gi, '$1').replace(/\s+/g, ' ').trim();
  let startDate, endDate;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s*(?:-|to)\s*(\d{4})-(\d{2})-(\d{2}))?$/i);
  if (iso) {
    startDate = calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    endDate = iso[4] ? calendarDate(Number(iso[4]), Number(iso[5]), Number(iso[6])) : startDate;
  } else {
    const match = text.match(englishRange);
    if (!match) return null;
    const startMonth = monthNumber(match[1]), endMonth = match[4] ? monthNumber(match[4]) : startMonth;
    const wrapsYear = endMonth < startMonth ? 1 : 0;
    const startYear = match[3] ? Number(match[3]) : match[6] ? Number(match[6]) - wrapsYear : eventYear;
    const endYear = match[6] ? Number(match[6]) : startYear + wrapsYear;
    startDate = calendarDate(startYear, startMonth, Number(match[2]));
    endDate = calendarDate(endYear, endMonth, Number(match[5] || match[2]));
  }
  if (!startDate || !endDate || endDate < startDate) return null;
  return { startDate, endDate, source: 'format', sourceText: value };
}

export function stageDateRange(rules, eventYear) {
  const ranges = rules.map(rule => parseStageDateRange(rule.original, eventYear));
  if (!ranges.length || ranges.some(range => !range)) return null;
  const [first] = ranges;
  return ranges.every(range => range.startDate === first.startDate && range.endDate === first.endDate) ? first : null;
}

export function formatStageDateRange(range) {
  if (!range) return '日期待定';
  const withYear = range.startDate.slice(0, 4) !== range.endDate.slice(0, 4);
  const format = date => (withYear ? date : date.slice(5)).replace(/-/g, '.');
  return range.startDate === range.endDate ? format(range.startDate) : `${format(range.startDate)} — ${format(range.endDate)}`;
}
