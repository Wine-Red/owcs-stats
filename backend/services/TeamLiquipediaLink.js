const { parseTournamentUrl } = require('./LiquipediaRosterParser');

const normalizeTeamLiquipediaUrl = value => {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Liquipedia 队伍页面必须是链接');
  if (!value.trim()) return null;
  try {
    return parseTournamentUrl(value).url;
  } catch {
    throw new Error('请输入有效的 Liquipedia Overwatch 队伍页面链接');
  }
};

// Older clients do not send this field. Omission must preserve the saved link.
const teamLiquipediaPayload = body => Object.prototype.hasOwnProperty.call(body || {}, 'liquipediaUrl')
  ? { liquipediaUrl: normalizeTeamLiquipediaUrl(body.liquipediaUrl) }
  : {};

const planTeamLiquipediaBackfill = (teams, entries) => {
  if (!Array.isArray(entries)) throw new Error('entries must be an array');
  const byId = new Map(teams.map(team => [Number(team.id), team]));
  const seen = new Set();
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
    return { teamId: team.id, name: team.name, before, after: url, changed: before !== url };
  });
};

module.exports = { normalizeTeamLiquipediaUrl, teamLiquipediaPayload, planTeamLiquipediaBackfill };
