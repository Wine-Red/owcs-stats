import { getRecordedMatchState, normalizeTeamName } from './matchScheduleReconciliation.mjs';

export const rowsOf = response => Array.isArray(response) ? response : response?.list || response?.data || [];

export function resolvePreviewTeam(teams, name) {
  const target = normalizeTeamName(name);
  if (!target) return null;
  return teams.find(team => [team.name, team.abbreviation, ...(team.aliases || [])]
    .some(alias => alias && normalizeTeamName(alias) === target)) || null;
}

export function recentTeamMatches(matches, teamId, before = Date.now()) {
  if (!teamId) return [];
  return matches.filter(match =>
    [match.team1Id, match.team2Id].some(id => String(id) === String(teamId)) &&
    match.winnerId != null && match.team1Score != null && match.team2Score != null &&
    getRecordedMatchState(match) === 'completed' &&
    new Date(match.matchDate).getTime() <= before
  ).sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate) || Number(b.id) - Number(a.id)).slice(0, 10);
}

export function teamScore(matches, teamId) {
  const score = { matchWin: 0, matchLoss: 0, mapWin: 0, mapLoss: 0, mapDiff: 0 };
  for (const match of matches) {
    const first = String(match.team1Id) === String(teamId);
    score.mapWin += Number(first ? match.team1Score : match.team2Score);
    score.mapLoss += Number(first ? match.team2Score : match.team1Score);
    if (String(match.winnerId) === String(teamId)) score.matchWin++;
    else score.matchLoss++;
  }
  score.mapDiff = score.mapWin - score.mapLoss;
  return score;
}

// Keep each team's sample separate, including when a player has changed teams.
export function aggregateRecentPlayers(games, stats, teamId) {
  const gamesById = new Map(games.map(game => [String(game.id), game]));
  const players = new Map();
  for (const stat of stats) {
    const game = gamesById.get(String(stat.mapGameId));
    if (!game || String(stat.teamId) !== String(teamId)) continue;
    const key = String(stat.playerId);
    if (!players.has(key)) players.set(key, {
      playerId: stat.playerId, teamId: stat.teamId,
      playerName: stat.player?.name, teamName: stat.team?.name,
      role: stat.player?.role || 'damage', player: stat.player, team: stat.team,
      gameTime: 0, elims: 0, assists: 0, deaths: 0, damage: 0, healing: 0, mitigation: 0
    });
    const player = players.get(key);
    player.gameTime += Number(game.duration) || 0;
    player.elims += Number(stat.kills) || 0;
    for (const field of ['assists', 'deaths', 'damage', 'healing', 'mitigation']) player[field] += Number(stat[field]) || 0;
  }
  return [...players.values()];
}

export async function mapWithConcurrency(items, mapper, concurrency = 6) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      result[index] = await mapper(items[index]);
    }
  }));
  return result;
}
