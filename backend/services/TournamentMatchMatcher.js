const { parseTournamentUrl } = require('./LiquipediaRosterParser');
const { getTeamLiquipediaUrls } = require('./TeamLiquipediaLink');
const normalize = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const pageKey = value => { try { return normalize(parseTournamentUrl(value).page); } catch { return ''; } };
const day = value => {
  if (!value) return NaN;
  const stamp = typeof value === 'number' ? new Date(value + 8 * 3600000).toISOString().slice(0, 10) : String(value).slice(0, 10);
  return Date.parse(`${stamp}T00:00:00Z`) / 86400000;
};

// Solve each connected set of rematches together. A link is safe only if every
// complete one-to-one assignment uses it; neither input order nor nearest date
// may decide an ambiguous pair. Incomplete/conflicting components stay unlinked.
function forcedAssignments(events) {
  const byLocal = new Map(), assigned = new Map();
  for (const event of events) for (const local of event.candidates) {
    const id = Number(local.id);
    if (!byLocal.has(id)) byLocal.set(id, []);
    byLocal.get(id).push(event);
  }
  const visited = new Set();
  for (const start of events) {
    if (visited.has(start) || !start.candidates.length) continue;
    const component = [start]; visited.add(start);
    for (const event of component) for (const local of event.candidates) for (const next of byLocal.get(Number(local.id))) {
      if (!visited.has(next)) { visited.add(next); component.push(next); }
    }
    if (component.some(event => event.conflict)) continue;
    const complete = (excludedEvent, excludedId) => {
      const owners = new Map();
      const place = (event, seen) => {
        for (const local of event.candidates) {
          const id = Number(local.id);
          if (seen.has(id) || (event === excludedEvent && id === excludedId)) continue;
          seen.add(id);
          if (!owners.has(id) || place(owners.get(id).event, seen)) {
            owners.set(id, { event, local }); return true;
          }
        }
        return false;
      };
      for (const event of component) if (!place(event, new Set())) return null;
      return [...owners.values()];
    };
    const solution = complete();
    if (!solution) continue;
    for (const { event, local } of solution) if (!complete(event, Number(local.id))) assigned.set(event, local);
  }
  return assigned;
}

// Confirmed pages identify teams across the site. Related seasons must be
// explicitly supplied by the server after verifying their shared source article.
function bindTournament(snapshot, { teams = [], allTeams = teams, aliases = [], matches = [], seasonId, matchSeasonIds } = {}) {
  const result = structuredClone(snapshot);
  const allowedSeasons = new Set([seasonId, ...(matchSeasonIds || [])].map(Number));
  const seasonMatches = seasonId == null && !matchSeasonIds ? matches : matches.filter(match => allowedSeasons.has(Number(match.seasonId)));
  const catalog = [...new Map([...teams, ...allTeams].map(team => [Number(team.id), team])).values()];
  const nameTeamIds = new Set([...teams.map(team => Number(team.id)),
    ...seasonMatches.flatMap(match => [Number(match.team1Id), Number(match.team2Id)])]);
  const nameTeams = catalog.filter(team => nameTeamIds.has(Number(team.id)));
  const redirects = new Map(Object.entries(snapshot.redirects || {}).map(([from, to]) => [normalize(from.replace(/_/g, ' ')), normalize(to.replace(/_/g, ' '))]));
  const canonical = url => {
    let page = pageKey(url); const seen = new Set();
    while (redirects.has(page) && !seen.has(page)) { seen.add(page); page = redirects.get(page); }
    return page;
  };
  const teamPages = new Map(catalog.map(team => [Number(team.id), new Set(getTeamLiquipediaUrls(team).map(canonical).filter(Boolean))]));
  const resolve = source => {
    const sourcePage = canonical(source.url);
    let candidates = sourcePage ? catalog.filter(t => teamPages.get(Number(t.id)).has(sourcePage)) : [];
    // A page identifies the team independently of its displayed name. Duplicate
    // page bindings stay ambiguous; names must not override either outcome.
    if (!candidates.length) {
      const names = new Set([source.name, source.shortName].map(normalize).filter(n => n && n !== '待定' && n !== 'tbd'));
      candidates = nameTeams.filter(t => [t.name, ...(t.aliases || []).map(a => typeof a === 'string' ? a : a.alias), ...aliases.filter(a => Number(a.teamId) === Number(t.id)).map(a => a.alias)].some(n => names.has(normalize(n))));
    }
    candidates = [...new Map(candidates.map(t => [Number(t.id), t])).values()];
    if (candidates.length === 1 && !(source.url && teamPages.get(Number(candidates[0].id)).size && !teamPages.get(Number(candidates[0].id)).has(sourcePage))) Object.assign(source, { teamId: Number(candidates[0].id), localName: candidates[0].name, logo: candidates[0].logo || null });
    return source;
  };
  const events = new Map();
  for (const block of result.blocks) {
    for (const row of block.rows || []) { resolve(row.team); for (const round of row.rounds || []) resolve(round.opponent); }
    for (const match of block.matches || []) {
      // Rebind from current evidence; never trust a previously cached local link.
      delete match.matchId;
      delete match.matchSeasonId;
      delete match.hasLocalResults;
      delete match.sourceConflict;
      match.opponents.forEach(resolve);
      const ids = match.opponents.map(o => o.teamId);
      if (!ids.every(Boolean) || ids[0] === ids[1] || !match.timestamp) continue;
      const key = `${block.stageId || block.sourceStage || ''}:${block.groupKey || ''}:${[...ids].sort((a, b) => a - b).join('-')}:${match.timestamp}`;
      const candidates = seasonMatches.filter(local => {
        const forward = Number(local.team1Id) === ids[0] && Number(local.team2Id) === ids[1];
        const reverse = Number(local.team1Id) === ids[1] && Number(local.team2Id) === ids[0];
        if ((!forward && !reverse) || !(Math.abs(day(local.matchDate) - day(match.timestamp)) <= 1)) return false;
        const sourceScores = match.opponents.map(o => o.score);
        const localScores = forward ? [local.team1Score, local.team2Score] : [local.team2Score, local.team1Score];
        // Local 0:0 may mean an unplayed fixture. Only corroborate completed scores.
        if (sourceScores.every(Number.isInteger) && localScores.every(Number.isInteger) && localScores.some(n => n > 0)) return sourceScores.every((s, i) => s === localScores[i]);
        return true;
      });
      const scores = match.opponents.map(o => [o.teamId, o.score]).sort((a, b) => a[0] - b[0]);
      const signature = JSON.stringify(scores);
      if (!events.has(key)) events.set(key, { representations: [], candidates, signature, conflict: Boolean(block.stageIssue) });
      const event = events.get(key);
      event.conflict ||= event.signature !== signature || Boolean(block.stageIssue);
      event.candidates = event.candidates.filter(candidate => candidates.some(other => other.id === candidate.id));
      event.representations.push(match);
    }
  }
  const assignments = forcedAssignments([...events.values()]);
  for (const event of events.values()) if (event.conflict) {
    for (const match of event.representations) match.sourceConflict = true;
  } else if (assignments.has(event)) {
    const local = assignments.get(event);
    for (const match of event.representations) {
      match.matchId = Number(local.id);
      match.hasLocalResults = Boolean(local.winnerId || Number(local.team1Score) > 0 || Number(local.team2Score) > 0);
      if (local.seasonId != null) match.matchSeasonId = Number(local.seasonId);
    }
  }
  // Swiss cells have no date. Reuse a verified source match from the same round
  // instead of guessing from a season-wide team pair (which may meet again).
  for (const block of result.blocks.filter(b => b.type === 'swiss')) {
    const sourcePage = pageKey(block.sourceUrl);
    const roundLists = result.blocks.filter(b => {
      const candidatePage = pageKey(b.sourceUrl);
      return b.type === 'matches' && !b.stageIssue && (!block.stageId || b.stageId === block.stageId)
        && sourcePage && (candidatePage === sourcePage || candidatePage.startsWith(`${sourcePage}/`));
    });
    for (const row of block.rows) for (const [index, round] of (row.rounds || []).entries()) {
      delete round.matchId;
      delete round.matchSeasonId;
      delete round.timestamp;
      delete round.opponents;
      delete round.hasLocalResults;
      delete round.sourceConflict;
      const scores = String(round.score).match(/^(\d+)\s*:\s*(\d+)$/);
      if ((!scores && round.score !== '—') || !row.team.teamId || !round.opponent.teamId) continue;
      const label = normalize(block.roundLabels?.[index] || `第 ${index + 1} 轮`);
      const candidates = roundLists.filter(b => normalize(b.title) === label).flatMap(b => b.matches).filter(match => {
        const own = match.opponents.find(t => t.teamId === row.team.teamId);
        const opponent = match.opponents.find(t => t.teamId === round.opponent.teamId);
        return own && opponent && own !== opponent && (scores
          ? own.score === Number(scores[1]) && opponent.score === Number(scores[2])
          : own.score == null && opponent.score == null);
      });
      // Duplicate source representations may describe one event. Distinct events,
      // unverified dates or ambiguous local matches must not create a link.
      if (candidates.length && candidates.every(m => m.matchId && m.timestamp && m.matchId === candidates[0].matchId && m.timestamp === candidates[0].timestamp)) {
        round.matchId = candidates[0].matchId;
        if (candidates[0].matchSeasonId != null) round.matchSeasonId = candidates[0].matchSeasonId;
      }
      if (candidates.length && candidates.every(m => m.timestamp && m.timestamp === candidates[0].timestamp && !m.sourceConflict)) {
        round.timestamp = candidates[0].timestamp;
        round.opponents = structuredClone(candidates[0].opponents);
        round.hasLocalResults = candidates.some(m => m.hasLocalResults);
      }
    }
  }
  const linkedBracket = result.blocks.some(b => b.type === 'bracket' && b.matches?.length > 1 && b.matches.some(m => m.matchId));
  const linkedSchedule = result.blocks.some(b => b.type === 'matches' && b.matches.some(m => m.matchId));
  result.preferredView = linkedBracket && !linkedSchedule ? 'bracket' : 'standings';
  return result;
}
module.exports = { bindTournament };
