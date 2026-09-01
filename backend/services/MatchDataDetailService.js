const plain = value => value?.toJSON ? value.toJSON() : value;

const timelineSummary = timelineInput => {
  const timelineRow = plain(timelineInput);
  if (!timelineRow) return null;
  const payload = timelineRow.payload || {};
  const events = Array.isArray(payload.events) ? payload.events : [];
  const eventTypes = events.reduce((result, event) => {
    const type = String(event?.type || 'unknown');
    result[type] = (result[type] || 0) + 1;
    return result;
  }, {});
  return {
    schemaVersion: timelineRow.schemaVersion,
    revision: timelineRow.revision,
    digest: timelineRow.digest,
    sourceTaskId: timelineRow.sourceTaskId,
    sourceUpdatedAt: timelineRow.sourceUpdatedAt,
    syncedAt: timelineRow.syncedAt,
    source: payload.source || null,
    counts: {
      players: Array.isArray(payload.players) ? payload.players.length : 0,
      segments: Array.isArray(payload.segments) ? payload.segments.length : 0,
      rounds: Array.isArray(payload.rounds) ? payload.rounds.length : 0,
      phases: Array.isArray(payload.phases) ? payload.phases.length : 0,
      events: events.length,
      evidence: Array.isArray(payload.evidence) ? payload.evidence.length : 0
    },
    eventTypes
  };
};

const buildMatchDataDetail = ({ match, mapGames, playerStats }) => {
  const matchValue = plain(match);
  const statsByMap = new Map();
  for (const statInput of playerStats || []) {
    const stat = plain(statInput);
    if (!statsByMap.has(String(stat.mapGameId))) statsByMap.set(String(stat.mapGameId), []);
    statsByMap.get(String(stat.mapGameId)).push(stat);
  }
  let heroStats = 0;
  let timelineMaps = 0;
  const maps = (mapGames || []).map(mapInput => {
    const mapGame = plain(mapInput);
    const stats = statsByMap.get(String(mapGame.id)) || [];
    heroStats += stats.reduce((sum, stat) => sum + (Array.isArray(stat.heroStats) ? stat.heroStats.length : 0), 0);
    const timeline = timelineSummary(mapGame.timeline);
    if (timeline) timelineMaps++;
    const { timeline: _timeline, ...withoutTimeline } = mapGame;
    return { ...withoutTimeline, timeline, playerStats: stats };
  });
  return {
    match: matchValue,
    summary: {
      mapGames: maps.length,
      playerStats: (playerStats || []).length,
      heroStats,
      timelineMaps,
      totalDurationSeconds: maps.reduce((sum, map) => sum + (Number(map.duration) || 0), 0)
    },
    mapGames: maps
  };
};

module.exports = { buildMatchDataDetail, timelineSummary };
