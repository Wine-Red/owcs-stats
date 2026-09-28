const datePattern = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g;

const calendarDate = (year, month, day) => {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month)
    && date.getUTCDate() === Number(day) ? value : null;
};

export function parseSeasonDateRange(value) {
  const matches = [...String(value || '').matchAll(datePattern)];
  if (matches.length !== 2) return null;
  const [start, end] = matches.map(([, year, month, day]) => calendarDate(year, month, day));
  return start && end && start <= end ? { start, end } : null;
}

export function shanghaiDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(now));
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function seasonStatusForDateRange(dateRange, now = Date.now()) {
  const range = parseSeasonDateRange(dateRange);
  if (!range) return null;
  const today = shanghaiDate(now);
  if (today < range.start) return 'upcoming';
  if (today > range.end) return 'completed';
  return 'in_progress';
}

export function presentSeason(season, dateRange, now = Date.now()) {
  const value = season?.get ? season.get({ plain: true }) : season;
  return { ...value, dateRange: dateRange || '', status: seasonStatusForDateRange(dateRange, now) || 'unknown' };
}
