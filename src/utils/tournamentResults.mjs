import { groupKey } from '../../backend/services/tournamentSemantics.mjs';

const record = value => {
  const match = String(value || '').match(/^(\d+)\s*[-–—:]\s*(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
};
const normalized = value => String(value || '').normalize('NFKC').replace(/_/g, ' ').trim().toLowerCase();
const pageKey = url => {
  try { return normalized(decodeURIComponent(new URL(url).pathname).replace(/^\/overwatch\//, '')); }
  catch { return ''; }
};
const identity = snapshot => {
  const redirects = new Map(Object.entries(snapshot.redirects || {}).map(([a, b]) => [normalized(a), normalized(b)]));
  return team => {
    let key = pageKey(team?.url); const seen = new Set();
    while (redirects.has(key) && !seen.has(key)) { seen.add(key); key = redirects.get(key); }
    // Source identity works even when the site has no corresponding team/match.
    return team?.teamId ? `local:${team.teamId}` : key ? `page:${key}` : '';
  };
};

export function attachStageResults(stage, snapshot = {}) {
  const teamKey = identity(snapshot);
  const tables = stage.blocks.filter(block => block.type === 'standings');
  const lists = stage.blocks.filter(block => block.type === 'matches' && !block.stageIssue);
  const enrich = table => {
    const unavailable = reason => ({ ...table, resultsStatus: { state: 'unavailable', reasons: [reason] } });
    if (stage.id === 'other' || table.stageIssue) return unavailable('unconfirmed-stage');
    const group = groupKey(table);
    if (tables.filter(other => groupKey(other) === group).length !== 1) return unavailable('ambiguous-table');
    const keys = table.rows.map(row => teamKey(row.team));
    if (keys.some(key => !key) || new Set(keys).size !== keys.length) return unavailable('ambiguous-team');
    const members = new Set(keys);
    const scoped = lists.filter(list => groupKey(list) === group);
    if (!scoped.length) return unavailable('missing-schedule');
    const events = new Map(), reasons = new Set();
    let conflict = false;
    for (const list of scoped) for (const match of list.matches || []) {
      const sides = (match.opponents || []).map(teamKey);
      if (sides.length !== 2 || sides.some(key => !key)) { reasons.add('unconfirmed-opponents'); continue; }
      if (sides[0] === sides[1] || sides.some(key => !members.has(key))) { reasons.add('foreign-team'); continue; }
      if (!Number.isFinite(match.timestamp) || match.timestamp <= 0) { reasons.add('unknown-date'); continue; }
      if (match.sourceConflict) { conflict = true; continue; }
      const pair = [...sides].sort();
      const key = `${pair.join('|')}@${match.timestamp}`;
      const score = JSON.stringify(pair.map(team => match.opponents[sides.indexOf(team)].score));
      const previous = events.get(key);
      if (previous) {
        if (previous.score !== score || (previous.match.matchId && match.matchId && (previous.match.matchId !== match.matchId || previous.match.matchSeasonId !== match.matchSeasonId))) conflict = true;
        // Missing/ambiguous local links must not be restored through a duplicate.
        if (previous.match.matchId !== match.matchId) previous.match = { ...previous.match, matchId: undefined, matchSeasonId: undefined };
      } else events.set(key, { key, score, sides, match, label: list.title });
    }
    const rows = table.rows.map((row, index) => {
      const ownKey = keys[index];
      const games = [...events.values()].filter(event => event.sides.includes(ownKey))
        .sort((a, b) => a.match.timestamp - b.match.timestamp || a.key.localeCompare(b.key))
        .map(({ key, sides, match, label }) => {
          const side = sides.indexOf(ownKey), own = match.opponents[side], opponent = match.opponents[1 - side];
          const known = own.score !== null && own.score !== undefined && opponent.score !== null && opponent.score !== undefined;
          return { key, opponent, score: known ? `${own.score}:${opponent.score}` : '—', ownScore: own.score,
            opponentScore: opponent.score, timestamp: match.timestamp, matchId: match.matchId, matchSeasonId: match.matchSeasonId,
            sourceUrl: match.sourceUrl, sourceLabel: label, opponents: match.opponents, navigation: match.navigation };
        });
      if (new Set(games.map(game => game.timestamp)).size !== games.length) reasons.add('ambiguous-order');
      const completed = games.filter(game => Number.isInteger(game.ownScore) && Number.isInteger(game.opponentScore)
        && game.ownScore !== game.opponentScore);
      const actual = [completed.filter(game => game.ownScore > game.opponentScore).length, completed.filter(game => game.ownScore < game.opponentScore).length];
      const actualMaps = [completed.reduce((n, game) => n + game.ownScore, 0), completed.reduce((n, game) => n + game.opponentScore, 0)];
      const baseline = stage.baselineTables?.flatMap(block => block.rows).filter(other => teamKey(other.team) === ownKey) || [];
      const offset = baseline.length === 1 ? record(baseline[0].matches) : null;
      const mapOffset = baseline.length === 1 ? record(baseline[0].maps) : null;
      if (stage.carryOver && (!offset || !mapOffset)) reasons.add('unknown-carry-over');
      for (const [expected, computed, previous] of [[record(row.matches), actual, offset], [record(row.maps), actualMaps, mapOffset]]) {
        if (!expected || (stage.carryOver && !previous)) continue;
        const target = expected.map((n, i) => n - (stage.carryOver ? previous[i] : 0));
        if (computed.some((n, i) => n > target[i])) conflict = true;
        else if (computed.some((n, i) => n < target[i])) reasons.add('incomplete-results');
      }
      if (stage.roundRobinCycles) {
        const expected = (keys.length - 1) * stage.roundRobinCycles;
        if (games.length < expected) reasons.add('incomplete-schedule');
        if (games.length > expected) conflict = true;
        const counts = new Map();
        for (const game of games) { const key = teamKey(game.opponent); counts.set(key, (counts.get(key) || 0) + 1); }
        if ([...counts.values()].some(count => count > stage.roundRobinCycles)) conflict = true;
      }
      if (games.some(game => ['W', 'L'].includes(game.ownScore))) reasons.add('non-numeric-result');
      return { ...row, games };
    });
    if (conflict) return { ...table, resultsStatus: { state: 'conflict', reasons: ['conflicting-results'] } };
    if (!events.size) return unavailable(reasons.has('unconfirmed-opponents') ? 'unconfirmed-opponents' : 'missing-schedule');
    if (reasons.has('ambiguous-order')) return unavailable('ambiguous-order');
    if (snapshot.discovery?.complete === false) reasons.add('incomplete-discovery');
    const partial = reasons.size > 0;
    return { ...table, rows, gameLabels: Array.from({ length: Math.max(...rows.map(row => row.games.length)) }, (_, i) => partial ? `已知 ${i + 1}` : `第 ${i + 1} 场`),
      resultsStatus: { state: partial ? 'partial' : 'available', reasons: [...reasons], matches: events.size } };
  };
  return { ...stage, blocks: stage.blocks.map(block => block.type === 'standings' ? enrich(block) : block) };
}
