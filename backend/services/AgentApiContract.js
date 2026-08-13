const API_VERSION = 'v1';
const SCHEMA_VERSION = '1.0.0';

const plain = value => {
  if (!value) return null;
  if (typeof value.get === 'function') return value.get({ plain: true });
  return value;
};

const nonNegativeInteger = value => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
};

const idName = value => {
  const row = plain(value);
  if (!row) return null;
  return { id: Number(row.id), name: row.name };
};

const serializeSeason = value => {
  const row = plain(value);
  return {
    id: Number(row.id),
    name: row.name,
    status: row.status
  };
};

const serializeTeam = value => idName(value);

const serializePlayer = value => {
  const row = plain(value);
  return {
    id: Number(row.id),
    name: row.name,
    role: row.role
  };
};

const serializeMap = value => {
  const row = plain(value);
  return {
    id: Number(row.id),
    name: row.name,
    mode: row.type
  };
};

const serializeHero = value => {
  const row = plain(value);
  return {
    id: Number(row.id),
    name: row.name,
    role: row.role,
    sub_role: row.subRole ?? null
  };
};

const serializeStage = (range, sequence) => ({
  id: Number(range.id),
  season_id: Number(range.seasonId),
  name: range.name,
  sequence,
  start_match_id: range.startMatch ? Number(range.startMatch.id) : null,
  end_match_id: range.endMatch ? Number(range.endMatch.id) : null,
  match_count: nonNegativeInteger(range.matchCount)
});

const serializeMatch = (value, stage = null) => {
  const row = plain(value);
  return {
    id: Number(row.id),
    season: idName(row.Season || row.season),
    stage: stage ? { id: Number(stage.id), name: stage.name } : null,
    match_date: row.matchDate,
    bo_format: row.boFormat ?? null,
    team1: {
      ...idName(row.team1),
      score: row.team1Score === null || row.team1Score === undefined
        ? null
        : nonNegativeInteger(row.team1Score)
    },
    team2: {
      ...idName(row.team2),
      score: row.team2Score === null || row.team2Score === undefined
        ? null
        : nonNegativeInteger(row.team2Score)
    },
    winner: idName(row.winner)
  };
};

const buildOptionalAvailability = ({
  statsVersion,
  playerStatCount,
  heroStatCount,
  playerStatsWithHeroStats = heroStatCount > 0 ? playerStatCount : 0
}) => {
  const enhancedStats = Number(statsVersion) >= 2;
  const hasPlayerStats = Number(playerStatCount) > 0;
  const hasHeroStats = Number(heroStatCount) > 0;
  const coveredPlayerStats = Number(playerStatsWithHeroStats) || 0;
  const heroCoverage = !hasPlayerStats || !hasHeroStats
    ? 0
    : coveredPlayerStats / Number(playerStatCount);
  const optionalStatus = !enhancedStats
    ? 'unavailable'
    : (!hasPlayerStats || !hasHeroStats
        ? 'unknown'
        : (heroCoverage >= 1 ? 'available' : 'partial'));

  return {
    player_stats: hasPlayerStats ? 'available' : 'unknown',
    ults_used: optionalStatus,
    final_blows: optionalStatus,
    player_hero_stats: optionalStatus
  };
};

const serializeOptionalFact = value => {
  const row = plain(value);
  return row
    ? { status: 'recorded', hero: idName(row) }
    : { status: 'unknown', hero: null };
};

const serializeDuration = value => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? { status: 'recorded', seconds }
    : { status: 'unknown', seconds: null };
};

const serializeMapGame = (value, counts = {}) => {
  const row = plain(value);
  return {
    id: Number(row.id),
    match_id: Number(row.matchId),
    map: serializeMap(row.Map || row.map),
    team1: {
      ...(idName(row.team1) || { id: null, name: null }),
      score: row.team1Score === null || row.team1Score === undefined
        ? null
        : nonNegativeInteger(row.team1Score)
    },
    team2: {
      ...(idName(row.team2) || { id: null, name: null }),
      score: row.team2Score === null || row.team2Score === undefined
        ? null
        : nonNegativeInteger(row.team2Score)
    },
    winner: idName(row.winner),
    bans: {
      team1: serializeOptionalFact(row.team1BanHero),
      team2: serializeOptionalFact(row.team2BanHero)
    },
    duration: serializeDuration(row.duration),
    availability: buildOptionalAvailability({
      statsVersion: row.statsVersion,
      playerStatCount: counts.playerStatCount,
      heroStatCount: counts.heroStatCount,
      playerStatsWithHeroStats: counts.playerStatsWithHeroStats
    })
  };
};

const serializePlayerStat = (value, optionalAvailability) => {
  const row = plain(value);
  const optionalAvailable = key => optionalAvailability?.[key] === 'available';
  return {
    id: Number(row.id),
    player: serializePlayer(row.player),
    team: idName(row.team),
    metrics: {
      kills: nonNegativeInteger(row.kills),
      deaths: nonNegativeInteger(row.deaths),
      assists: nonNegativeInteger(row.assists),
      damage: nonNegativeInteger(row.damage),
      healing: nonNegativeInteger(row.healing),
      mitigation: nonNegativeInteger(row.mitigation),
      ults_used: optionalAvailable('ults_used') ? nonNegativeInteger(row.ultsUsed) : null,
      final_blows: optionalAvailable('final_blows') ? nonNegativeInteger(row.finalBlows) : null
    }
  };
};

const serializePlayerHeroStat = value => {
  const row = plain(value);
  const hero = row.hero
    ? serializeHero(row.hero)
    : {
        id: row.heroId === null || row.heroId === undefined ? null : Number(row.heroId),
        name: row.heroName,
        role: null,
        sub_role: null
      };
  return {
    id: Number(row.id),
    player_stat_id: Number(row.playerStatId),
    hero,
    metrics: {
      usage_seconds: nonNegativeInteger(row.usageSeconds),
      usage_percentage: Number(row.usagePercentage) || 0,
      final_blows: nonNegativeInteger(row.finalBlows),
      deaths_by_final_blow: nonNegativeInteger(row.deathsByFinalBlow),
      ults_ready: nonNegativeInteger(row.ultReady),
      ults_used: nonNegativeInteger(row.ultUsed),
      avg_ult_charge_seconds: row.avgUltChargeSeconds === null || row.avgUltChargeSeconds === undefined
        ? null
        : Number(row.avgUltChargeSeconds)
    }
  };
};

const statusFromAvailability = statuses => {
  const values = statuses.filter(Boolean);
  if (!values.length) return 'unknown';
  if (values.every(value => value === values[0])) return values[0];
  return 'partial';
};

module.exports = {
  API_VERSION,
  SCHEMA_VERSION,
  buildOptionalAvailability,
  idName,
  nonNegativeInteger,
  plain,
  serializeDuration,
  serializeHero,
  serializeMap,
  serializeMapGame,
  serializeMatch,
  serializePlayer,
  serializePlayerHeroStat,
  serializePlayerStat,
  serializeSeason,
  serializeStage,
  serializeTeam,
  statusFromAvailability
};
