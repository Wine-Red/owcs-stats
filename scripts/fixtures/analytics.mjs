// Synthetic public data for instrumentation QA. No real votes or model requests.
export const seasons = [
  { id: 24, name: 'OWCS 2026 中国赛区 第三赛段', stage: '2026 第三赛段', status: 'in_progress' },
  { id: 23, name: 'OWCS 2026 中国赛区 第二赛段', stage: '2026 第二赛段', status: 'completed' },
];
export const teams = [{ id: 1, name: 'Weibo Gaming', logo: '' }, { id: 2, name: 'JD Gaming', logo: '' }];
export const players = ['SHY', 'LIGE', 'LEAVE', 'MMONK', 'LENGSA', 'PROPER', 'SOMEONE', 'HEESANG', 'VIOL2T', 'CHORONG']
  .map((name, index) => ({ id: index + 1, name, role: ['damage', 'tank', 'damage', 'support', 'support'][index % 5] }));
export const maps = [{ id: 1, name: '尼泊尔', type: '控制地图' }];
export const heroes = [{ id: 1, name: '猎空', role: 'damage' }];
export const match = { id: 7, seasonId: 24, team1Id: 1, team2Id: 2, team1: teams[0], team2: teams[1], team1Score: 3, team2Score: 1, winnerId: 1, matchDate: '2026-09-20', tournamentName: seasons[0].name, Season: seasons[0] };
export const stats = players.map((player, index) => ({ id: index + 1, playerId: player.id, playerName: player.name, player, role: player.role, teamId: index < 5 ? 1 : 2, team: teams[index < 5 ? 0 : 1], gameTime: 600, kills: 18, elims: 18, deaths: 5, assists: 12, damage: 12000, healing: 4000, mitigation: 10000, finalBlows: 7, mapGameId: 11 }));
export const timeline = {
  schemaVersion: 2, timebase: { kind: 'round-local' }, players,
  rounds: [{ roundId: 'r1', index: 1, durationMs: 300000 }, { roundId: 'r2', index: 2, durationMs: 300000 }],
  phases: [], events: [
    { eventId: 'e1', roundId: 'r1', timeMs: 20000, type: 'kill', status: 'confirmed', killerId: 1, victimId: 6 },
    { eventId: 'e2', roundId: 'r2', timeMs: 40000, type: 'ultimate_used', status: 'confirmed', playerId: 1 },
  ],
};
export const mapGame = { id: 11, matchId: 7, mapId: 1, Map: maps[0], duration: 600, winnerId: 1, replayId: 'QA-CODE', timeline: { schemaVersion: 2, rounds: timeline.rounds, counts: { events: 2 }, eventTypes: { kill: 1, ultimate_used: 1 } } };
export function apiFixture(path, query) {
  if (path === '/seasons') return seasons;
  if (/^\/seasons\/\d+$/.test(path)) return seasons.find(s => String(s.id) === path.split('/').at(-1)) || seasons[0];
  if (path === '/teams') return teams;
  if (/^\/teams\/\d+$/.test(path)) return teams.find(t => String(t.id) === path.split('/').at(-1));
  if (path === '/players') return players;
  if (path === '/maps') return maps;
  if (path === '/heroes') return heroes;
  if (path === '/matches') return { list: [match], total: 1 };
  if (path === '/matches/7') return match;
  if (path === '/matches/upcoming') return [];
  if (path === '/matches/7/map-games' || path === '/map-games') return [mapGame];
  if (path === '/map-games/11/player-stats') return stats;
  if (path === '/map-games/11') return { ...mapGame, timeline: { payload: timeline } };
  if (/\/features$/.test(path)) return { hasBans: true, hasHeroStats: true, hasFinalBlows: true };
  if (/^\/season-stats\/\d+$/.test(path)) return stats;
  if (/\/team-score$/.test(path)) return teams.map(team => ({ teamId: team.id, team, matchWin: 3, matchLoss: 1, mapWin: 9, mapLoss: 4, mapDiff: 5 }));
  if (/\/map-picks$/.test(path)) return [{ mapId: 1, map: maps[0], pickCount: 1 }];
  if (path === '/season-teams' || /\/seasons\/\d+\/teams$/.test(path)) return teams.map(team => ({ id: team.id, teamId: team.id, seasonId: 24, team }));
  if (/\/season-teams\/\d+\/players$/.test(path)) return [];
  if (/\/stats\/player\/\d+\/profile$/.test(path)) {
    const player = players.find(p => String(p.id) === path.split('/')[3]);
    return { player, totals: { gameTime: 600, elims: 18, deaths: 5, damage: 12000 }, seasonHistory: [{ seasonId: 24, season: seasons[0], team: teams[0], teamId: 1, ...stats[player.id - 1] }], recentMaps: [{ ...mapGame, mapName: '尼泊尔', team: teams[0], teamId: 1, opponentId: 2, matchDate: match.matchDate }] };
  }
  if (path === '/stats/hero/overview') return { data: [{ heroId: 1, hero: heroes[0], heroName: '猎空', role: 'damage', mapsAppeared: 1, pickCount: 1, banCount: 1, winRate: 100, usageSeconds: 600 }] };
  if (path === '/stats/hero/players') return { data: stats.map(s => ({ ...s, usageSeconds: 600 })) };
  if (path === '/stats/player/heroes') return { data: [{ heroId: 1, heroName: '猎空', usageSeconds: 600, mapsPlayed: 1 }] };
  if (path === '/config/visualize_chart_config') return {};
  if (path.startsWith('/config/')) return {};
  void query;
  return [];
}
