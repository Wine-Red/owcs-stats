// Sum final blows across a player's appearances; percentages cannot be averaged.
// Missing map coverage must not masquerade as a complete match result.
export function aggregateMatchFleta(mapGames, playerStats) {
  const maps = new Map(mapGames.map(game => [String(game.id), game]));
  const players = new Map();
  const seen = new Set();
  for (const stat of playerStats) {
    const map = maps.get(String(stat.mapGameId));
    if (!map) continue;
    const id = String(stat.playerId);
    const appearance = `${map.id}:${id}`;
    if (seen.has(appearance)) continue;
    seen.add(appearance);
    const total = players.get(id) || { finalBlows: 0, teamFinalBlows: 0, complete: true };
    if (!map.timeline || stat.fletaFinalBlows == null || stat.fletaTeamFinalBlows == null
      || !Number.isFinite(Number(stat.fletaFinalBlows)) || !Number.isFinite(Number(stat.fletaTeamFinalBlows))) {
      total.complete = false;
    } else {
      total.finalBlows += Number(stat.fletaFinalBlows);
      total.teamFinalBlows += Number(stat.fletaTeamFinalBlows);
    }
    players.set(id, total);
  }
  return new Map([...players].map(([id, total]) => [id,
    total.complete && total.teamFinalBlows > 0 ? total.finalBlows * 200 / total.teamFinalBlows : null
  ]));
}
