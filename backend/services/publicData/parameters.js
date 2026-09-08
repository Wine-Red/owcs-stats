const { invalid } = require('./errors');

const ROLES = ['tank', 'damage', 'support'];
const MODES = { control: '占领要点', escort: '运载目标', hybrid: '攻击/护送', push: '机动推进', flashpoint: '闪点作战' };
const normalizeName = value => String(value).replace(/\s+/gu, ' ').trim().toLowerCase();
const positiveId = (value, name) => {
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw invalid(`${name} must be a positive integer.`);
  return Number(value);
};
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1000-01-01'
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// Use the original query string: Express's object parser can hide duplicate keys.
const parseParameters = (req, allowed, paginated = false) => {
  const query = new URLSearchParams(req.originalUrl.split('?').slice(1).join('?'));
  const values = {};
  const accepted = new Set([...allowed, ...(paginated ? ['limit', 'cursor'] : [])]);
  for (const [key, value] of query) {
    if (!accepted.has(key)) throw invalid(`Unknown parameter: ${key}.`);
    if (Object.hasOwn(values, key)) throw invalid(`Parameter ${key} must occur only once.`);
    if (key.endsWith('_id')) values[key] = positiveId(value, key);
    else if (key === 'limit') {
      values.limit = positiveId(value, key);
      if (values.limit > 100) throw invalid('limit must be between 1 and 100.');
    } else if (key === 'cursor') {
      if (!value || value.length > 4096) throw invalid('cursor is invalid.');
      values.cursor = value;
    } else if (key === 'q') {
      if (Array.from(value).length > 100 || !normalizeName(value)) throw invalid('q must contain 1 to 100 characters.');
      values.q = normalizeName(value);
    } else if (key === 'date_from' || key === 'date_to') {
      if (!isDate(value)) throw invalid(`${key} must be a valid YYYY-MM-DD date.`);
      values[key] = value;
    } else {
      const enums = { role: ROLES, mode: Object.keys(MODES), status: ['in_progress', 'completed'] };
      if (!enums[key]?.includes(value)) throw invalid(`Invalid ${key}.`);
      values[key] = value;
    }
  }
  if (paginated && values.limit === undefined) values.limit = 50;
  if (values.stage_id && !values.competition_id && !req.params.competition_id) throw invalid('stage_id requires competition_id.');
  if (values.opponent_id && (!values.team_id || values.team_id === values.opponent_id)) throw invalid('opponent_id requires a different team_id.');
  if (values.date_from && values.date_to && values.date_from > values.date_to) throw invalid('date_from must not be later than date_to.');
  const params = Object.fromEntries(Object.entries(req.params).map(([key, value]) => [key, positiveId(value, key)]));
  return { params, query: values };
};

module.exports = { MODES, ROLES, normalizeName, positiveId, isDate, parseParameters };
