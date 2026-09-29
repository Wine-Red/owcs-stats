const { parseTournamentUrl } = require('./LiquipediaRosterParser');
const { getTeamLiquipediaUrls } = require('./TeamLiquipediaLink');

const key = value => String(value || '').normalize('NFKC').toLowerCase();
const title = url => parseTournamentUrl(url).page;
const canonicalTitle = (value, redirects = {}) => {
  let current = value;
  const byKey = new Map(Object.entries(redirects).map(([from, to]) => [key(from), to]));
  const seen = new Set();
  while (byKey.has(key(current)) && !seen.has(key(current))) {
    seen.add(key(current));
    current = byKey.get(key(current));
  }
  return key(current);
};

// A page title (after MediaWiki redirects), rather than a short name or logo,
// is the identity evidence. One source page may be listed in multiple cards.
const matchTeamsByPage = ({ sourceTeams, teams, redirects = {}, seasonTeams = [] }) => {
  const catalog = new Map();
  for (const team of teams) for (const url of getTeamLiquipediaUrls(team)) {
    const identity = canonicalTitle(title(url), redirects);
    if (!catalog.has(identity)) catalog.set(identity, new Map());
    catalog.get(identity).set(Number(team.id), team);
  }
  const source = new Map();
  for (const team of sourceTeams) {
    const identity = canonicalTitle(title(team.link), redirects);
    if (!source.has(identity)) source.set(identity, { ...team, canonicalPage: identity });
  }
  const existingIds = new Set(seasonTeams.map(row => Number(row.teamId)));
  const rows = [...source.values()].map(team => {
    const matches = [...(catalog.get(team.canonicalPage)?.values() || [])];
    const match = matches.length === 1 ? matches[0] : null;
    return { ...team, teamId: match ? Number(match.id) : null, matchedName: match?.name || '',
      existing: !!match && existingIds.has(Number(match.id)), status: match ? 'matched' : 'skipped',
      reason: matches.length > 1 ? `同一 Liquipedia 页面绑定了多个本地队伍：${matches.map(row => `${row.name} #${row.id}`).join('、')}` :
        !matches.length ? '没有本地队伍绑定这个 Liquipedia 页面，请先在队伍管理中补充页面' : '' };
  });
  const byTeamId = new Map();
  for (const row of rows) {
    if (row.status !== 'matched') continue;
    if (!byTeamId.has(row.teamId)) byTeamId.set(row.teamId, []);
    byTeamId.get(row.teamId).push(row);
  }
  for (const duplicates of byTeamId.values()) {
    if (duplicates.length < 2) continue;
    for (const row of duplicates) {
      row.status = 'skipped';
      row.reason = '赛事中多个不同页面指向同一支本地队伍，请人工核对';
    }
  }
  return { teams: rows, summary: { totalTeams: rows.length, matchedTeams: rows.filter(row => row.status === 'matched').length,
    newTeams: rows.filter(row => row.status === 'matched' && !row.existing).length,
    existingTeams: rows.filter(row => row.status === 'matched' && row.existing).length,
    skippedTeams: rows.filter(row => row.status === 'skipped').length } };
};
module.exports = { canonicalTitle, matchTeamsByPage };
