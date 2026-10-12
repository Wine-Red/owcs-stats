const key = value => String(value ?? '').trim().toLowerCase();

// Final blows come directly from eligible kill events, including kills whose
// hero could not be identified. Never substitute legacy default-zero stats.
const calculateMapFleta = (game, stats, payload) => {
  const result = new Map();
  if (!Array.isArray(payload?.players) || !Array.isArray(payload?.events)) return result;
  const counts = new Map(payload.players.map(player => [key(player.playerId), 0]));
  const totals = { A: 0, B: 0 };
  const players = new Map(payload.players.map(player => [key(player.playerId), player]));
  const seen = new Set();
  for (const event of payload.events) {
    if (event?.type !== 'kill' || event.statisticsEligible === false
      || (event.status != null && event.status !== 'confirmed')) continue;
    const eventId = event.eventId || event.id;
    if (eventId && seen.has(eventId)) continue;
    if (eventId) seen.add(eventId);
    const killer = players.get(key(event.killerId));
    // An unassigned kill makes the denominator uncertain for both teams.
    if (!killer || !Object.hasOwn(totals, killer.teamSide)) return result;
    counts.set(key(killer.playerId), counts.get(key(killer.playerId)) + 1);
    totals[killer.teamSide]++;
  }
  for (const stat of stats) {
    const side = String(stat.teamId) === String(game.team1Id) ? 'A'
      : String(stat.teamId) === String(game.team2Id) ? 'B' : null;
    if (!side || !totals[side]) continue;
    const names = new Set([stat.player?.name, stat.playerName, ...(stat.player?.aliases || [])].filter(Boolean).map(key));
    const sidePlayers = payload.players.filter(player => player.teamSide === side);
    const byExternalId = stat.player?.externalId
      ? sidePlayers.filter(player => key(player.playerId) === key(stat.player.externalId)) : [];
    const matches = byExternalId.length ? byExternalId : sidePlayers.filter(player =>
      names.has(key(player.displayName)) || names.has(key(player.playerId)));
    if (matches.length !== 1) continue;
    const finalBlows = counts.get(key(matches[0].playerId));
    result.set(Number(stat.playerId), { finalBlows, teamFinalBlows: totals[side],
      fletaIndex: finalBlows * 200 / totals[side] });
  }
  return result;
};

const loadTimelines = async (mapIds, rawData) => {
  if (rawData) return Object.values(rawData.timelines || {}).filter(row => mapIds.includes(Number(row.mapGameId)));
  if (!mapIds.length) return [];
  const { Op } = require('sequelize');
  return require('../models/MapGameTimeline').findAll({ where: { mapGameId: { [Op.in]: mapIds } }, raw: true });
};

const calculateSeasonFleta = ({ mapGames, playerStats, playerById, timelines }) => {
  const totals = new Map();
  const games = new Map(mapGames.map(game => [Number(game.id), game]));
  for (const timeline of timelines) {
    const game = games.get(Number(timeline.mapGameId));
    if (!game) continue;
    const stats = playerStats.filter(stat => Number(stat.mapGameId) === Number(game.id))
      .map(stat => ({ ...stat, player: playerById.get(Number(stat.playerId)) || stat.player }));
    for (const [playerId, value] of calculateMapFleta(game, stats, timeline.payload)) {
      const total = totals.get(playerId) || { finalBlows: 0, teamFinalBlows: 0, maps: 0 };
      total.finalBlows += value.finalBlows;
      total.teamFinalBlows += value.teamFinalBlows;
      total.maps++;
      totals.set(playerId, total);
    }
  }
  return new Map([...totals].map(([id, total]) => [id, {
    fletaIndex: total.finalBlows * 200 / total.teamFinalBlows,
    fletaMaps: total.maps
  }]));
};

const serializeMapFleta = value => ({
  fletaIndex: value?.fletaIndex ?? null,
  fletaFinalBlows: value?.finalBlows ?? null,
  fletaTeamFinalBlows: value?.teamFinalBlows ?? null
});

module.exports = { calculateMapFleta, calculateSeasonFleta, loadTimelines, serializeMapFleta };
