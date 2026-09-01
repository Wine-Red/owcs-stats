const integer = value => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
const lower = value => String(value || '').trim().toLocaleLowerCase('en-US');

const parseKad = value => {
  const [kills = 0, assists = 0, deaths = 0] = String(value || '').split('/').map(integer);
  return { kills, assists, deaths };
};

const heroIdentity = event => {
  const heroId = String(event?.heroId || event?.hero || '').trim();
  if (!heroId) return null;
  return {
    heroId,
    heroName: String(event?.heroName || event?.hero || heroId).trim()
  };
};

const eventPlayerId = event => event?.playerId || event?.killerId || null;

/** Build the exact JSON mirror row consumed by IncrementalMatchSyncService. */
const buildTimelineMirrorAttributes = (round, syncedAt = new Date()) => {
  if (!round?.timeline || typeof round.timeline !== 'object') {
    throw new Error('A MatchWeb timeline is required for mirroring');
  }
  const timelineMeta = round.timelineMeta || {};
  return {
    schemaVersion: integer(round.timeline.schemaVersion) || 1,
    revision: integer(timelineMeta.revision) || 1,
    digest: String(timelineMeta.digest || ''),
    sourceTaskId: String(timelineMeta.sourceTaskId || round.timeline.source?.taskId || ''),
    payload: round.timeline,
    sourceUpdatedAt: timelineMeta.updatedAt || null,
    syncedAt
  };
};

const aggregateTimeline = (timeline, fallbackRound = {}) => {
  if (!timeline || !Array.isArray(timeline.players) || !Array.isArray(timeline.events)) {
    return { playersA: fallbackRound.playersA || [], playersB: fallbackRound.playersB || [] };
  }
  const durationMs = integer(timeline.media?.durationMs);
  const events = timeline.events
    .filter(event => event && event.status !== 'rejected' && Number.isFinite(Number(event.timeMs)))
    .sort((left, right) => Number(left.timeMs) - Number(right.timeMs));
  const windows = Array.isArray(timeline.rounds) && timeline.rounds.length
    ? timeline.rounds.map((round, index) => ({
      roundId: round.roundId || `round-${index + 1}`,
      startMs: integer(round.startMs),
      endMs: Math.max(integer(round.startMs), integer(round.endMs))
    }))
    : [{ roundId: null, startMs: 0, endMs: durationMs }];
  const fallbackPlayers = [...(fallbackRound.playersA || []), ...(fallbackRound.playersB || [])];
  const fallbackById = new Map(fallbackPlayers.flatMap(player => [
    player.playerId, player.name
  ].filter(Boolean).map(value => [lower(value), player])));

  const timelinePlayers = timeline.players.map(player => ({
    ...player,
    playerId: String(player.playerId),
    displayName: String(player.displayName || player.playerId)
  }));
  const timelineIds = new Set(timelinePlayers.map(player => lower(player.playerId)));
  for (const [side, players] of [['A', fallbackRound.playersA || []], ['B', fallbackRound.playersB || []]]) {
    for (const player of players) {
      const playerId = String(player.playerId || player.name || '').trim();
      if (!playerId || timelineIds.has(lower(playerId))) continue;
      timelinePlayers.push({
        playerId,
        displayName: player.name || playerId,
        teamSide: side,
        role: player.role,
        slot: -1,
        confidence: 1
      });
      timelineIds.add(lower(playerId));
    }
  }

  const results = { playersA: [], playersB: [] };
  for (const player of timelinePlayers) {
    const playerId = player.playerId;
    const fallback = fallbackById.get(lower(playerId)) || {};
    const heroRows = new Map();
    const rowFor = identity => {
      const key = lower(identity.heroId);
      if (!heroRows.has(key)) heroRows.set(key, {
        heroId: identity.heroId,
        hero: identity.heroName,
        usageSeconds: 0,
        usagePercentage: 0,
        ultReady: 0,
        ultUsed: 0,
        avgUltChargeSeconds: null,
        finalBlows: 0,
        deathsByFinalBlow: 0,
        _usageMs: 0,
        _chargeSamples: []
      });
      return heroRows.get(key);
    };
    const playerEvents = events.filter(event => (
      event.playerId === playerId || event.killerId === playerId || event.victimId === playerId
    ));
    const heroEvents = playerEvents.filter(event => (
      event.playerId === playerId && ['hero_selected', 'hero_switch'].includes(event.type)
        && heroIdentity(event)
    ));

    for (const window of windows) {
      const changes = heroEvents.filter(event => (
        (event.roundId == null || window.roundId == null || event.roundId === window.roundId)
        && Number(event.timeMs) >= window.startMs
        && Number(event.timeMs) <= window.endMs
      ));
      let active = null;
      let activeSince = window.startMs;
      for (const event of changes) {
        const next = heroIdentity(event);
        if (active) rowFor(active)._usageMs += Math.max(0, Number(event.timeMs) - activeSince);
        active = next;
        activeSince = Number(event.timeMs);
      }
      if (active) rowFor(active)._usageMs += Math.max(0, window.endMs - activeSince);
    }

    const heroAt = event => {
      const direct = heroIdentity(event);
      if (direct) return direct;
      const prior = heroEvents.filter(candidate => (
        Number(candidate.timeMs) <= Number(event.timeMs)
        && (event.roundId == null || candidate.roundId == null || candidate.roundId === event.roundId)
      )).at(-1);
      return heroIdentity(prior);
    };

    const deathKeys = new Set();
    for (const event of playerEvents) {
      const identity = heroAt(event);
      if (event.type === 'kill' && event.killerId === playerId) {
        if (identity) rowFor(identity).finalBlows++;
      }
      if ((event.type === 'kill' && event.victimId === playerId)
        || (event.type === 'death' && event.playerId === playerId)) {
        const key = `${event.roundId || ''}:${Math.round(Number(event.timeMs) / 1500)}`;
        if (!deathKeys.has(key)) {
          deathKeys.add(key);
          if (identity) rowFor(identity).deathsByFinalBlow++;
        }
      }
      if (event.playerId !== playerId || !identity) continue;
      const row = rowFor(identity);
      if (event.type === 'ultimate_ready') {
        row.ultReady++;
        const boundary = playerEvents.filter(candidate => (
          candidate.playerId === playerId
          && Number(candidate.timeMs) < Number(event.timeMs)
          && (event.roundId == null || candidate.roundId == null || candidate.roundId === event.roundId)
          && ['hero_selected', 'hero_switch', 'ultimate_used'].includes(candidate.type)
        )).at(-1);
        const window = windows.find(candidate => event.roundId && candidate.roundId === event.roundId);
        const startMs = boundary ? Number(boundary.timeMs) : (window?.startMs ?? 0);
        row._chargeSamples.push(Math.max(0, (Number(event.timeMs) - startMs) / 1000));
      }
      if (event.type === 'ultimate_used') row.ultUsed++;
    }

    const totalUsageMs = [...heroRows.values()].reduce((sum, hero) => sum + hero._usageMs, 0);
    const heroes = [...heroRows.values()].map(row => {
      const charge = row._chargeSamples.length
        ? row._chargeSamples.reduce((sum, value) => sum + value, 0) / row._chargeSamples.length
        : null;
      const result = {
        heroId: row.heroId,
        hero: row.hero,
        usageSeconds: Math.round(row._usageMs / 1000),
        usagePercentage: totalUsageMs ? Math.round(row._usageMs / totalUsageMs * 10_000) / 100 : 0,
        ultReady: row.ultReady,
        ultUsed: row.ultUsed,
        avgUltChargeSeconds: charge === null ? null : Math.round(charge * 100) / 100,
        finalBlows: row.finalBlows,
        deathsByFinalBlow: row.deathsByFinalBlow
      };
      return result;
    }).sort((left, right) => right.usageSeconds - left.usageSeconds || left.heroId.localeCompare(right.heroId));
    const result = {
      ...fallback,
      playerId,
      name: fallback.name || player.displayName,
      role: fallback.role || player.role,
      // MatchWeb's source scoreboard is authoritative for every player-level
      // statistic. Timeline events only enrich the per-hero breakdown below.
      kad: fallback.kad || '0/0/0',
      finalBlows: integer(fallback.finalBlows),
      heroes
    };
    if (player.teamSide === 'A') results.playersA.push(result);
    else results.playersB.push(result);
  }
  return results;
};

module.exports = { aggregateTimeline, buildTimelineMirrorAttributes, heroIdentity, parseKad };
