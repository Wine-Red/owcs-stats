const { unavailable } = require('./errors');
const { MODES, ROLES, isDate, normalizeName } = require('./parameters');

const nonNegative = value => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const integer = value => {
  const number = nonNegative(value);
  return Number.isSafeInteger(number) ? number : null;
};
const id = value => {
  const number = integer(value);
  if (!number) throw unavailable('Invalid resource identity.');
  return number;
};
const name = value => {
  if (typeof value !== 'string' || !value.trim()) throw unavailable('Missing resource name.');
  return value;
};
const ref = (key, label) => ({ id: id(key), name: name(label) });
const choice = (value, allowed) => {
  if (!allowed.includes(value)) throw unavailable('Unknown catalog classification.');
  return value;
};
const competition = row => ({ ...ref(row.id, row.name), status: choice(row.status, ['in_progress', 'completed']) });
const team = (row, aliases = []) => ({ ...ref(row.id, row.name), aliases: [...new Set(aliases.map(name))].sort() });
const player = row => ({ ...ref(row.id, row.name), role: choice(row.role, ROLES) });
const map = row => ({ ...ref(row.id, row.name), mode: choice(Object.keys(MODES).find(mode => MODES[mode] === row.type), Object.keys(MODES)) });
const hero = row => ({ ...ref(row.id, row.name), role: choice(row.role, ROLES), sub_role: typeof row.subRole === 'string' && row.subRole.trim() ? row.subRole : null });
const stage = (row, index) => ({ ...ref(row.id, row.name), competition_id: id(row.seasonId), sequence: index + 1 });
const winner = row => {
  if (row.winnerId === null || row.winnerId === undefined) return null;
  const key = id(row.winnerId);
  if (![id(row.team1Id), id(row.team2Id)].includes(key)) throw unavailable('Winner is not a participant.');
  return key;
};
const match = (row, range) => {
  if (id(row.team1Id) === id(row.team2Id)) throw unavailable('Match has identical participants.');
  if (!isDate(row.matchDate)) throw unavailable('Invalid match date.');
  const winnerId = winner(row);
  const score1 = integer(row.team1Score), score2 = integer(row.team2Score);
  if (winnerId !== null && score1 !== null && score2 !== null
    && (score1 === score2 || winnerId !== id(score1 > score2 ? row.team1Id : row.team2Id))) {
    throw unavailable('Series winner conflicts with the series score.');
  }
  const format = typeof row.boFormat === 'string' ? row.boFormat.trim().toUpperCase() : '';
  return {
    id: id(row.id), competition: ref(row.seasonId, row.competitionName),
    stage: range ? ref(range.id, range.name) : null, date: row.matchDate,
    format: /^BO[1-9][0-9]*$/.test(format) ? format : null,
    team1: { team: ref(row.team1Id, row.team1Name), score: score1 },
    team2: { team: ref(row.team2Id, row.team2Name), score: score2 },
    winner_team_id: winnerId
  };
};
const duration = value => {
  const minutes = nonNegative(value);
  const seconds = minutes === null ? null : Math.round(minutes * 60);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
};
const game = (row, parent, stats) => {
  if (id(row.matchId) !== parent.id || id(row.seasonId) !== parent.competition.id
    || id(row.team1Id) !== parent.team1.team.id || id(row.team2Id) !== parent.team2.team.id) {
    throw unavailable('Game and parent match identities disagree.');
  }
  const players = new Set();
  const counts = new Map([[id(row.team1Id), 0], [id(row.team2Id), 0]]);
  for (const stat of stats) {
    if (stat.game_id !== id(row.id) || !counts.has(stat.team.id) || players.has(stat.player.id)) {
      throw unavailable('Player statistics have duplicate or conflicting identities.');
    }
    players.add(stat.player.id);
    counts.set(stat.team.id, counts.get(stat.team.id) + 1);
  }
  const number = integer(row.externalRoundIndex);
  const side = index => ({
    team: ref(row[`team${index}Id`], row[`team${index}Name`]),
    score: integer(row[`team${index}Score`]),
    banned_hero: row[`team${index}BanHeroId`] == null ? null : ref(row[`team${index}BanHeroId`], row[`team${index}BanHeroName`])
  });
  return {
    id: id(row.id), match_id: id(row.matchId), number: number !== null && Number.isSafeInteger(number + 1) ? number + 1 : null,
    map: map({ id: row.mapId, name: row.mapName, type: row.mapType }),
    team1: side(1), team2: side(2), winner_team_id: winner(row), duration_seconds: duration(row.duration),
    replay_code: typeof row.replayId === 'string' && row.replayId.trim() ? row.replayId.trim() : null,
    player_stats_coverage: {
      status: !stats.length ? 'not_recorded' : [...counts.values()].every(count => count === 5) ? 'recorded' : 'partial',
      recorded_players: stats.length, expected_players: 10
    }
  };
};
const heroStat = row => ({
  hero: row.heroId == null ? { id: null, name: name(row.heroName) } : ref(row.heroId, row.catalogHeroName),
  metrics: {
    usage_seconds: integer(row.usageSeconds),
    usage_percentage: nonNegative(row.usagePercentage) <= 100 ? nonNegative(row.usagePercentage) : null,
    final_blows: integer(row.finalBlows), death_events: integer(row.deathsByFinalBlow),
    ultimate_ready_events: integer(row.ultReady), ultimates_used: integer(row.ultUsed),
    average_ultimate_charge_seconds: nonNegative(row.avgUltChargeSeconds)
  }
});
const playerStat = (row, heroes = []) => {
  const items = heroes.map(heroStat);
  const keys = new Set();
  for (const item of items) {
    const key = item.hero.id === null ? `name:${normalizeName(item.hero.name)}` : `id:${item.hero.id}`;
    if (keys.has(key)) throw unavailable('Duplicate hero identity in player statistics.');
    keys.add(key);
  }
  return {
    game_id: id(row.mapGameId), team: ref(row.teamId, row.teamName),
    player: player({ id: row.playerId, name: row.playerName, role: row.playerRole }),
    metrics: {
      eliminations: integer(row.kills), assists: integer(row.assists), deaths: integer(row.deaths),
      damage: integer(row.damage), healing: integer(row.healing), damage_mitigated: integer(row.mitigation),
      // Current storage has no per-field evidence of complete collection. Neither
      // statsVersion nor filtered hero rows can certify these whole-game values.
      final_blows: null, ultimates_used: null
    },
    hero_stats: { status: items.length ? 'recorded' : 'not_recorded', items }
  };
};
const resultConsistency = (parent, games) => {
  const scores = [parent.team1.score, parent.team2.score];
  if (scores.some(score => score === null) || !games.length) return 'insufficient_data';
  const wins = [parent.team1.team.id, parent.team2.team.id].map(teamId => games.filter(g => g.winner_team_id === teamId).length);
  if (wins.some((count, index) => count > scores[index])) return 'conflicting';
  return games.every(g => g.winner_team_id !== null) && wins.every((count, index) => count === scores[index])
    ? 'consistent' : 'insufficient_data';
};
const coverage = (competitionId, stageId, matches, bundles) => {
  const games = bundles.map(bundle => bundle.game);
  const withHeroes = bundles.map(bundle => bundle.player_stats.filter(p => p.hero_stats.status === 'recorded').length);
  return {
    competition_id: competitionId, stage_id: stageId ?? null, matches: matches.length, games: games.length,
    latest_match_date: matches.map(m => m.date).sort().at(-1) ?? null,
    player_stats: {
      recorded_games: games.filter(g => g.player_stats_coverage.status === 'recorded').length,
      partial_games: games.filter(g => g.player_stats_coverage.status === 'partial').length,
      missing_games: games.filter(g => g.player_stats_coverage.status === 'not_recorded').length,
      recorded_rows: bundles.reduce((sum, b) => sum + b.player_stats.length, 0)
    },
    duration: { recorded_games: games.filter(g => g.duration_seconds !== null).length, missing_games: games.filter(g => g.duration_seconds === null).length },
    hero_stats: { games_with_records: withHeroes.filter(count => count > 0).length, player_game_records_with_hero_stats: withHeroes.reduce((a, b) => a + b, 0) },
    bans: { total_team_slots: games.length * 2, recorded_team_slots: games.reduce((sum, g) => sum + Number(g.team1.banned_hero !== null) + Number(g.team2.banned_hero !== null), 0) }
  };
};
const schedule = (result, competitions, teams) => {
  if (!Array.isArray(result?.data) || !Number.isFinite(result.observedAt) || typeof result.stale !== 'boolean') throw unavailable('Schedule source has no successful observation.');
  const find = (value, rows, labels) => {
    const key = normalizeName(value);
    const matches = rows.filter(row => labels(row).some(label => label && normalizeName(label) === key));
    return matches.length === 1 ? ref(matches[0].id, matches[0].name) : { id: null, name: name(value) };
  };
  const teamRef = value => !value?.trim() || /^(tbd|tba|bye)$/i.test(value.trim()) ? null : find(value, teams, row => [row.name, ...row.aliases]);
  return {
    data: result.data.map(item => ({
      competition: find(item.tournamentName, competitions, row => [row.name, row.externalEventName]),
      scheduled_at: typeof item.timestamp === 'number' && Number.isFinite(item.timestamp) && item.timestamp > 0
        && Number.isFinite(new Date(item.timestamp).getTime()) ? new Date(item.timestamp).toISOString() : null,
      team1: teamRef(item.team1?.name), team2: teamRef(item.team2?.name)
    })),
    freshness: { observed_at: new Date(result.observedAt).toISOString(), stale: result.stale }
  };
};

module.exports = { integer, nonNegative, ref, competition, team, player, map, hero, stage, match, duration, game, playerStat, resultConsistency, coverage, schedule };
