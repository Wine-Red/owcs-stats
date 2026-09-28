const { parseTournamentUrl } = require('./LiquipediaRosterParser');

// Explicit configuration always wins. Fallbacks cover the site's canonical
// OWCS season names, not fuzzy title searches or database-specific season IDs.
function resolveTournamentSource(season, config = {}) {
  if (config?.liquipediaTournamentUrl) return parseTournamentUrl(config.liquipediaTournamentUrl).url;
  const name = String(season?.name || '').trim();
  const event = String(season?.externalEventName || '').trim();
  let page;
  const regional = name.match(/^(20\d{2}) OWCS (国服|欧中非|北美|韩国)赛区第([一二三])阶段$/);
  if (regional) {
    const [, year, region, stage] = regional;
    const number = { 一: 1, 二: 2, 三: 3 }[stage];
    const suffix = region === '韩国' ? `Asia/Stage_${number}/Korea` : `${{ 国服: 'China', 欧中非: 'EMEA', 北美: 'NA' }[region]}/Stage_${number}`;
    page = `Overwatch_Champions_Series/${year}/${suffix}`;
  } else if (/^OWCSCC20\d{2}$/.test(event)) {
    page = `Overwatch_Champions_Series/${event.slice(-4)}/Champions_Clash`;
  } else if (/^MSC20\d{2}$/.test(event)) {
    page = `Overwatch_Champions_Series/${event.slice(-4)}/Midseason_Championship`;
  } else {
    const cup = name.match(/^(20\d{2}) 守望先锋世界杯(?: 小组赛| 季后赛)?$/);
    if (cup) page = `Overwatch_World_Cup/${cup[1]}`;
  }
  return page ? parseTournamentUrl(`https://liquipedia.net/overwatch/${page}`).url : null;
}
// Only the exact resolved article establishes a shared event. Sibling paths
// (e.g. qualifiers and regular season) or similar names are not evidence.
function resolveTournamentSeasonIds(sourceUrl, seasons = [], configs = []) {
  const page = parseTournamentUrl(sourceUrl).page;
  const byKey = new Map(configs.map(config => [config.key, config.value]));
  return [...new Set(seasons.flatMap(season => {
    const id = Number(season.id);
    if (!Number.isSafeInteger(id) || id < 1) return [];
    try {
      const config = byKey.get(`visualize_season_${id}`);
      const value = typeof config === 'string' ? JSON.parse(config) : config;
      const url = resolveTournamentSource(season, value);
      return url && parseTournamentUrl(url).page === page ? [id] : [];
    } catch { return []; } // A broken unrelated configuration cannot widen scope.
  }))];
}
// Child pages must be listed in a complete snapshot of this exact article.
// URL ancestry alone must never authorize a qualifier or unrelated phase.
function resolveTournamentSourcePages(sourceUrl, snapshot) {
  const root = parseTournamentUrl(sourceUrl).page;
  const pages = new Set([root]);
  if (snapshot?.page !== root || !snapshot.blocks?.length) return [...pages];
  const conflicted = new Set((snapshot.blocks || []).filter(block => block.stageIssue).flatMap(block => {
    try { return [parseTournamentUrl(block.sourceUrl).page]; } catch { return []; }
  }));
  for (const source of snapshot.sources || []) {
    try {
      const page = parseTournamentUrl(source.url).page;
      if (page.startsWith(`${root}/`) && !conflicted.has(page)) pages.add(page);
    } catch { /* Invalid saved source cannot widen the voting scope. */ }
  }
  return [...pages];
}
module.exports = { resolveTournamentSource, resolveTournamentSeasonIds, resolveTournamentSourcePages };
