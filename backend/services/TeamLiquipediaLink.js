const { parseTournamentUrl } = require('./LiquipediaRosterParser');

const normalizeTeamLiquipediaUrl = value => {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Liquipedia 队伍页面必须是链接');
  if (!value.trim()) return null;
  if (value.length > 1024) throw new Error('Liquipedia 队伍页面链接不能超过 1024 个字符');
  try {
    return parseTournamentUrl(value).url;
  } catch {
    throw new Error('请输入有效的 Liquipedia Overwatch 队伍页面链接');
  }
};

const pageKey = url => parseTournamentUrl(url).page.normalize('NFKC').toLowerCase();
const normalizeTeamLiquipediaUrls = values => {
  if (!Array.isArray(values)) throw new Error('Liquipedia 队伍页面必须是链接列表');
  const unique = new Map();
  for (const value of values) {
    const url = normalizeTeamLiquipediaUrl(value);
    if (url && !unique.has(pageKey(url))) unique.set(pageKey(url), url);
  }
  return [...unique.values()];
};

// Read old rows/exports without a migration that rewrites existing identities.
const getTeamLiquipediaUrls = (team = {}) => normalizeTeamLiquipediaUrls([
  team.liquipediaUrl || null, ...(Array.isArray(team.liquipediaUrls) ? team.liquipediaUrls : [])
]);
const serializeTeamLiquipedia = team => {
  const plain = typeof team.toJSON === 'function' ? team.toJSON() : team;
  const liquipediaUrls = getTeamLiquipediaUrls(plain);
  return { ...plain, liquipediaUrl: liquipediaUrls[0] || null, liquipediaUrls };
};
const has = (body, key) => Object.prototype.hasOwnProperty.call(body || {}, key);

// A new list replaces the list, including explicit clearing. Legacy clients can
// replace the primary URL without silently deleting the additional pages.
const teamLiquipediaPayload = (body, current = {}) => {
  let urls;
  if (has(body, 'liquipediaUrls')) urls = normalizeTeamLiquipediaUrls(body.liquipediaUrls);
  else if (has(body, 'liquipediaUrl')) {
    const previous = current.liquipediaUrl ? pageKey(current.liquipediaUrl) : null;
    urls = normalizeTeamLiquipediaUrls([body.liquipediaUrl, ...getTeamLiquipediaUrls(current).filter(url => pageKey(url) !== previous)]);
  } else return {};
  return { liquipediaUrl: urls[0] || null, liquipediaUrls: urls };
};

const assertTeamLiquipediaAvailable = (urls, teams, teamId = null) => {
  const requested = new Set(urls.map(pageKey));
  for (const team of teams) {
    if (Number(team.id) === Number(teamId)) continue;
    const conflict = getTeamLiquipediaUrls(team).find(url => requested.has(pageKey(url)));
    if (conflict) throw new Error(`Liquipedia 页面“${parseTournamentUrl(conflict).page}”已绑定队伍“${team.name}”`);
  }
};

const prepareTeamLiquipediaPayload = async (body, { teamId = null, transaction, model } = {}) => {
  if (!has(body, 'liquipediaUrls') && !has(body, 'liquipediaUrl')) return {};
  // Lock the catalog in ID order through commit so concurrent saves cannot both
  // claim the same page. This is a small admin-only write, never a public read.
  if (!transaction) throw new Error('Team link changes require a transaction');
  const teams = await (model || require('../models/Team')).findAll({ transaction, order: [['id', 'ASC']], lock: transaction.LOCK.UPDATE });
  const current = teams.find(team => Number(team.id) === Number(teamId));
  const payload = teamLiquipediaPayload(body, current);
  assertTeamLiquipediaAvailable(payload.liquipediaUrls, teams, teamId);
  return payload;
};

const planTeamLiquipediaBackfill = (teams, entries) => {
  if (!Array.isArray(entries)) throw new Error('entries must be an array');
  const byId = new Map(teams.map(team => [Number(team.id), team]));
  const seen = new Set();
  const plannedPages = new Set();
  return entries.map(entry => {
    const team = byId.get(entry.teamId);
    if (!Number.isSafeInteger(entry.teamId) || !team || team.name !== entry.name || seen.has(entry.teamId)) {
      throw new Error(`Team identity changed or duplicated: ${entry.teamId}`);
    }
    seen.add(entry.teamId);
    const url = normalizeTeamLiquipediaUrl(entry.liquipediaUrl);
    if (!url || !Number.isSafeInteger(entry.pageId) || entry.pageId <= 0 || !entry.evidence?.length) {
      throw new Error(`Verified source evidence required: ${entry.name}`);
    }
    const before = team.liquipediaUrl || null;
    if (before && before !== url) throw new Error(`Existing link conflicts: ${entry.name}`);
    assertTeamLiquipediaAvailable([url], teams, team.id);
    if (plannedPages.has(pageKey(url))) throw new Error(`Liquipedia page duplicated in backfill: ${url}`);
    plannedPages.add(pageKey(url));
    return { teamId: team.id, name: team.name, before, after: url, changed: before !== url };
  });
};

module.exports = { normalizeTeamLiquipediaUrl, normalizeTeamLiquipediaUrls, getTeamLiquipediaUrls,
  serializeTeamLiquipedia, teamLiquipediaPayload, prepareTeamLiquipediaPayload,
  assertTeamLiquipediaAvailable, planTeamLiquipediaBackfill };
