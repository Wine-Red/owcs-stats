const { Op } = require('sequelize');
const Season = require('../../models/Season');
const SeasonStage = require('../../models/SeasonStage');
const Match = require('../../models/Match');
const MapGame = require('../../models/MapGame');
const PlayerStat = require('../../models/PlayerStat');
const PlayerHeroStat = require('../../models/PlayerHeroStat');
const Player = require('../../models/Player');
const Team = require('../../models/Team');
const Hero = require('../../models/Hero');
const MapModel = require('../../models/Map');
const SeasonStageService = require('../SeasonStageService');
const { getMetric } = require('./MetricRegistry');

const normalize = value => String(value || '').trim().toLocaleLowerCase('zh-CN').replace(/[\s._-]+/g, '');
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const ratio = (part, whole) => whole > 0 ? part / whole : 0;
const round = (value, digits = 4) => Number(number(value).toFixed(digits));

const matchNames = (rows, names) => {
  if (!names?.length) return { ids: null, unresolved: [] };
  const ids = new Set();
  const unresolved = [];
  for (const requested of names) {
    const needle = normalize(requested);
    const exact = rows.filter(row => normalize(row.name) === needle);
    const candidates = exact.length ? exact : rows.filter(row => normalize(row.name).includes(needle) || needle.includes(normalize(row.name)));
    if (candidates.length === 1) ids.add(Number(candidates[0].id));
    else if (candidates.length > 1) candidates.slice(0, 5).forEach(row => ids.add(Number(row.id)));
    else unresolved.push(requested);
  }
  return { ids, unresolved };
};

const coverageState = value => value >= 0.98 ? 'available' : value > 0 ? 'partial' : 'unavailable';

class AnalyticsExecutor {
  constructor(models = {}) {
    this.models = {
      Season: models.Season || Season,
      SeasonStage: models.SeasonStage || SeasonStage,
      Match: models.Match || Match,
      MapGame: models.MapGame || MapGame,
      PlayerStat: models.PlayerStat || PlayerStat,
      PlayerHeroStat: models.PlayerHeroStat || PlayerHeroStat,
      Player: models.Player || Player,
      Team: models.Team || Team,
      Hero: models.Hero || Hero,
      Map: models.Map || MapModel
    };
  }

  async resolveSeason(plan) {
    const { Season: SeasonModel } = this.models;
    if (plan.seasonId) return SeasonModel.findByPk(plan.seasonId, { raw: true });
    if (!plan.seasonName) return null;
    const seasons = await SeasonModel.findAll({ raw: true });
    const matched = matchNames(seasons, [plan.seasonName]);
    return matched.ids?.size === 1
      ? seasons.find(item => matched.ids.has(Number(item.id))) || null
      : null;
  }

  async resolveScope(plan) {
    const season = await this.resolveSeason(plan);
    if (plan.subject !== 'match' && !season) {
      return { error: '需要明确一个有效赛季，才能保证不同赛事的统计口径不会混在一起。' };
    }
    if ((plan.seasonId || plan.seasonName) && !season) return { error: '没有找到问题中指定的赛季。' };

    let stage = null;
    let matchIds = null;
    if (plan.stageId || plan.stageName) {
      if (!season) return { error: '指定阶段前需要先明确赛季。' };
      const stages = await this.models.SeasonStage.findAll({ where: { seasonId: season.id }, raw: true });
      if (plan.stageId) stage = stages.find(item => Number(item.id) === Number(plan.stageId));
      else {
        const matched = matchNames(stages, [plan.stageName]);
        if (matched.ids?.size === 1) stage = stages.find(item => matched.ids.has(Number(item.id)));
      }
      if (!stage) return { error: '没有找到问题中指定的赛季阶段。' };
      const range = await SeasonStageService.resolveStageRange(season.id, stage.id);
      matchIds = range?.matchIds || [];
    }
    return { season, stage, matchIds };
  }

  async loadFacts(plan, scope) {
    const { Match: MatchModel, MapGame: MapGameModel, PlayerStat: PlayerStatModel, PlayerHeroStat: HeroStatModel } = this.models;
    const matchWhere = {};
    if (scope.season) matchWhere.seasonId = scope.season.id;
    if (scope.matchIds) matchWhere.id = { [Op.in]: scope.matchIds };
    if (plan.filters.dateFrom || plan.filters.dateTo) {
      matchWhere.matchDate = {};
      if (plan.filters.dateFrom) matchWhere.matchDate[Op.gte] = plan.filters.dateFrom;
      if (plan.filters.dateTo) matchWhere.matchDate[Op.lte] = plan.filters.dateTo;
    }
    const matches = await MatchModel.findAll({ where: matchWhere, order: [['matchDate', 'ASC'], ['id', 'ASC']], raw: true });
    const allowedMatchIds = matches.map(item => Number(item.id));
    const mapWhere = scope.season ? { seasonId: scope.season.id } : {};
    if (scope.matchIds || plan.filters.dateFrom || plan.filters.dateTo) mapWhere.matchId = { [Op.in]: allowedMatchIds };
    let mapGames = await MapGameModel.findAll({ where: mapWhere, raw: true });

    const [players, teams, heroes, maps] = await Promise.all([
      this.models.Player.findAll({ raw: true }),
      this.models.Team.findAll({ raw: true }),
      this.models.Hero.findAll({ raw: true }),
      this.models.Map.findAll({ raw: true })
    ]);
    const playerMatch = matchNames(players, plan.filters.playerNames);
    const teamMatch = matchNames(teams, plan.filters.teamNames);
    const heroMatch = matchNames(heroes, plan.filters.heroNames);
    const mapMatch = matchNames(maps, plan.filters.mapNames);
    const warnings = [];
    for (const [label, unresolved] of [
      ['选手', playerMatch.unresolved], ['战队', teamMatch.unresolved], ['英雄', heroMatch.unresolved], ['地图', mapMatch.unresolved]
    ]) if (unresolved.length) warnings.push(`未识别${label}：${unresolved.join('、')}`);

    const mapById = new Map(maps.map(item => [Number(item.id), item]));
    if (mapMatch.ids) mapGames = mapGames.filter(item => mapMatch.ids.has(Number(item.mapId)));
    if (plan.filters.mapTypes.length) {
      const types = new Set(plan.filters.mapTypes.map(normalize));
      mapGames = mapGames.filter(item => types.has(normalize(mapById.get(Number(item.mapId))?.type)));
    }

    const mapGameIds = mapGames.map(item => Number(item.id));
    const needsPlayerStats = plan.subject === 'player' || plan.subject === 'hero';
    const needsHeroStats = plan.subject === 'hero';
    let playerStats = needsPlayerStats && mapGameIds.length
      ? await PlayerStatModel.findAll({ where: { mapGameId: { [Op.in]: mapGameIds } }, order: [['id', 'ASC']], raw: true })
      : [];
    const allPlayerStats = playerStats;
    const allPlayerStatIds = allPlayerStats.map(item => Number(item.id));
    const heroStats = needsHeroStats && allPlayerStatIds.length
      ? await HeroStatModel.findAll({ where: { playerStatId: { [Op.in]: allPlayerStatIds } }, raw: true })
      : [];

    if (playerMatch.ids) playerStats = playerStats.filter(item => playerMatch.ids.has(Number(item.playerId)));
    if (teamMatch.ids) playerStats = playerStats.filter(item => teamMatch.ids.has(Number(item.teamId)));
    if (plan.filters.roles.length) {
      const roleSet = new Set(plan.filters.roles);
      const playerById = new Map(players.map(item => [Number(item.id), item]));
      playerStats = playerStats.filter(item => roleSet.has(playerById.get(Number(item.playerId))?.role));
    }

    const mapsWithStats = new Set(allPlayerStats.map(item => Number(item.mapGameId))).size;
    const statById = new Map(allPlayerStats.map(item => [Number(item.id), item]));
    const mapsWithHeroStats = new Set(heroStats.map(item => Number(statById.get(Number(item.playerStatId))?.mapGameId)).filter(Boolean)).size;
    const mapsWithBans = mapGames.filter(item => item.team1BanHeroId || item.team2BanHeroId).length;
    const totalMaps = mapGames.length;
    const coverage = {
      basicStats: needsPlayerStats
        ? { status: coverageState(ratio(mapsWithStats, totalMaps)), ratio: round(ratio(mapsWithStats, totalMaps)) }
        : { status: 'not_applicable', ratio: null },
      heroDetails: needsHeroStats
        ? { status: coverageState(ratio(mapsWithHeroStats, totalMaps)), ratio: round(ratio(mapsWithHeroStats, totalMaps)) }
        : { status: 'not_applicable', ratio: null },
      heroBans: plan.subject === 'hero' && plan.metric === 'hero_bans'
        ? { status: coverageState(ratio(mapsWithBans, totalMaps)), ratio: round(ratio(mapsWithBans, totalMaps)) }
        : { status: 'not_applicable', ratio: null }
    };
    if (plan.subject === 'hero') {
      const key = plan.metric === 'hero_bans' ? 'heroBans' : 'heroDetails';
      if (coverage[key].status !== 'available') {
        const label = plan.metric === 'hero_bans' ? '英雄禁用' : '英雄明细';
        warnings.push(coverage[key].status === 'unavailable'
          ? `当前范围没有可用的${label}记录，无法计算该指标。`
          : `${label}覆盖率为 ${(coverage[key].ratio * 100).toFixed(1)}%，结论仅基于已有记录。`);
      }
    }

    return {
      matches, mapGames, playerStats, allPlayerStats, heroStats, players, teams, heroes, maps,
      playerMatch, teamMatch, heroMatch, mapMatch, coverage, warnings
    };
  }

  playerRows(plan, facts) {
    const playerById = new Map(facts.players.map(item => [Number(item.id), item]));
    const teamById = new Map(facts.teams.map(item => [Number(item.id), item]));
    const gameById = new Map(facts.mapGames.map(item => [Number(item.id), item]));
    const grouped = new Map();
    for (const stat of facts.playerStats) {
      const player = playerById.get(Number(stat.playerId));
      if (!player) continue;
      if (!grouped.has(player.id)) grouped.set(player.id, {
        id: player.id, name: player.name, role: player.role, teamName: '', maps: new Set(), minutesPlayed: 0,
        kills: 0, assists: 0, deaths: 0, damage: 0, healing: 0, mitigation: 0, finalBlows: 0
      });
      const row = grouped.get(player.id);
      row.teamName = teamById.get(Number(stat.teamId))?.name || row.teamName;
      row.maps.add(Number(stat.mapGameId));
      row.minutesPlayed += number(gameById.get(Number(stat.mapGameId))?.duration);
      for (const key of ['kills', 'assists', 'deaths', 'damage', 'healing', 'mitigation', 'finalBlows']) row[key] += number(stat[key]);
    }
    const metric = getMetric('player', plan.metric);
    return [...grouped.values()].map(row => {
      row.mapsPlayed = row.maps.size;
      row.kd = row.deaths ? row.kills / row.deaths : row.kills;
      row.kad = row.deaths ? (row.kills + row.assists) / row.deaths : row.kills + row.assists;
      let value = metric.calculated ? row[metric.calculated] : row[metric.source];
      if (metric.per10) value = row.minutesPlayed ? value / row.minutesPlayed * 10 : 0;
      return {
        playerId: row.id, playerName: row.name, teamName: row.teamName, role: row.role,
        value: round(value), mapsPlayed: row.mapsPlayed, minutesPlayed: round(row.minutesPlayed, 1)
      };
    }).filter(row => row.mapsPlayed >= plan.minimumMaps && row.minutesPlayed >= plan.minimumMinutes);
  }

  teamRows(plan, facts) {
    const teamById = new Map(facts.teams.map(item => [Number(item.id), item]));
    const grouped = new Map();
    const ensure = id => {
      const team = teamById.get(Number(id));
      if (!team) return null;
      if (!grouped.has(team.id)) grouped.set(team.id, {
        teamId: team.id, teamName: team.name, matchesPlayed: 0, matchWins: 0, matchLosses: 0,
        mapWins: 0, mapLosses: 0
      });
      return grouped.get(team.id);
    };
    for (const match of facts.matches) {
      const left = ensure(match.team1Id); const right = ensure(match.team2Id);
      if (!left || !right) continue;
      left.matchesPlayed += 1; right.matchesPlayed += 1;
      const leftWon = number(match.team1Score) > number(match.team2Score);
      const rightWon = number(match.team2Score) > number(match.team1Score);
      if (leftWon) { left.matchWins += 1; right.matchLosses += 1; }
      if (rightWon) { right.matchWins += 1; left.matchLosses += 1; }
    }
    for (const game of facts.mapGames) {
      const left = ensure(game.team1Id); const right = ensure(game.team2Id);
      if (!left || !right) continue;
      if (Number(game.winnerId) === Number(game.team1Id)) { left.mapWins += 1; right.mapLosses += 1; }
      else if (Number(game.winnerId) === Number(game.team2Id)) { right.mapWins += 1; left.mapLosses += 1; }
    }
    const metric = getMetric('team', plan.metric);
    return [...grouped.values()].filter(row => !facts.teamMatch.ids || facts.teamMatch.ids.has(Number(row.teamId))).map(row => {
      row.matchWinRate = ratio(row.matchWins, row.matchWins + row.matchLosses) * 100;
      row.mapWinRate = ratio(row.mapWins, row.mapWins + row.mapLosses) * 100;
      row.mapDifferential = row.mapWins - row.mapLosses;
      return { ...row, value: round(row[metric.calculated]) };
    }).filter(row => row.mapWins + row.mapLosses >= plan.minimumMaps);
  }

  mapRows(plan, facts) {
    const mapById = new Map(facts.maps.map(item => [Number(item.id), item]));
    const grouped = new Map();
    for (const game of facts.mapGames) {
      const map = mapById.get(Number(game.mapId));
      if (!map) continue;
      if (!grouped.has(map.id)) grouped.set(map.id, { mapId: map.id, mapName: map.name, mapType: map.type, pickCount: 0, teamWins: 0, teamGames: 0 });
      const row = grouped.get(map.id);
      row.pickCount += 1;
      if (facts.teamMatch.ids) {
        for (const teamId of facts.teamMatch.ids) {
          if (Number(game.team1Id) === teamId || Number(game.team2Id) === teamId) {
            row.teamGames += 1;
            if (Number(game.winnerId) === teamId) row.teamWins += 1;
          }
        }
      }
    }
    return [...grouped.values()].map(row => ({
      ...row,
      teamWinRate: ratio(row.teamWins, row.teamGames) * 100,
      value: round(plan.metric === 'map_win_rate' ? ratio(row.teamWins, row.teamGames) * 100 : row.pickCount)
    }));
  }

  heroRows(plan, facts) {
    const allowedStatIds = new Set(facts.playerStats.map(item => Number(item.id)));
    const heroById = new Map(facts.heroes.map(item => [Number(item.id), item]));
    const grouped = new Map();
    const ensure = (name, id = null) => {
      const key = normalize(name);
      if (!grouped.has(key)) grouped.set(key, {
        heroId: id, heroName: name, usageSeconds: 0, finalBlows: 0, ultWeighted: 0, ultWeight: 0, banCount: 0
      });
      return grouped.get(key);
    };
    for (const stat of facts.heroStats) {
      if (!allowedStatIds.has(Number(stat.playerStatId))) continue;
      const hero = heroById.get(Number(stat.heroId));
      const row = ensure(hero?.name || stat.heroName, hero?.id || stat.heroId);
      const usage = number(stat.usageSeconds);
      row.usageSeconds += usage;
      row.finalBlows += number(stat.finalBlows);
      if (stat.avgUltChargeSeconds !== null && stat.avgUltChargeSeconds !== undefined && usage > 0) {
        row.ultWeighted += number(stat.avgUltChargeSeconds) * usage;
        row.ultWeight += usage;
      }
    }
    for (const game of facts.mapGames) {
      for (const id of [game.team1BanHeroId, game.team2BanHeroId].filter(Boolean)) {
        const hero = heroById.get(Number(id));
        if (hero) ensure(hero.name, hero.id).banCount += 1;
      }
    }
    const totalUsage = [...grouped.values()].reduce((sum, item) => sum + item.usageSeconds, 0);
    const metricKey = getMetric('hero', plan.metric).calculated;
    return [...grouped.values()].filter(row => {
      if (facts.heroMatch.ids && !facts.heroMatch.ids.has(Number(row.heroId))) return false;
      return plan.metric === 'hero_bans' ? row.banCount > 0 : row.usageSeconds > 0;
    }).map(row => {
      row.usageRate = ratio(row.usageSeconds, totalUsage) * 100;
      row.finalBlowsPer10 = row.usageSeconds ? row.finalBlows / (row.usageSeconds / 60) * 10 : 0;
      row.avgUltChargeSeconds = row.ultWeight ? row.ultWeighted / row.ultWeight : null;
      return {
        heroId: row.heroId, heroName: row.heroName, value: row[metricKey] === null ? null : round(row[metricKey]),
        usageSeconds: round(row.usageSeconds), usageRate: round(row.usageRate), banCount: row.banCount
      };
    });
  }

  matchRows(plan, facts) {
    const teamById = new Map(facts.teams.map(item => [Number(item.id), item]));
    return facts.matches.filter(match => {
      if (!facts.teamMatch.ids) return true;
      return facts.teamMatch.ids.has(Number(match.team1Id)) || facts.teamMatch.ids.has(Number(match.team2Id));
    }).map(match => ({
      matchId: match.id,
      date: match.matchDate,
      team1: teamById.get(Number(match.team1Id))?.name || `战队 ${match.team1Id}`,
      team2: teamById.get(Number(match.team2Id))?.name || `战队 ${match.team2Id}`,
      score: `${number(match.team1Score)}:${number(match.team2Score)}`,
      winner: teamById.get(Number(match.winnerId))?.name || '',
      boFormat: match.boFormat || ''
    })).reverse();
  }

  async execute(plan) {
    const scope = await this.resolveScope(plan);
    if (scope.error) return { rows: [], warnings: [scope.error], coverage: {}, scope: {}, insufficient: true };
    const facts = await this.loadFacts(plan, scope);
    const metricDefinition = getMetric(plan.subject, plan.metric);
    if (metricDefinition?.requiresTeam && (!facts.teamMatch.ids || facts.teamMatch.ids.size === 0)) {
      return {
        rows: [],
        metric: plan.metric,
        metricLabel: metricDefinition.label,
        scope: {
          seasonId: scope.season?.id || null,
          seasonName: scope.season?.name || '全部赛事',
          stageId: scope.stage?.id || null,
          stageName: scope.stage?.name || '',
          matchCount: facts.matches.length,
          mapCount: facts.mapGames.length
        },
        coverage: facts.coverage,
        warnings: [...facts.warnings, '查询地图胜率时需要明确指定一支或多支战队。'],
        insufficient: true
      };
    }
    let rows;
    if (plan.subject === 'player') rows = this.playerRows(plan, facts);
    else if (plan.subject === 'team') rows = this.teamRows(plan, facts);
    else if (plan.subject === 'map') rows = this.mapRows(plan, facts);
    else if (plan.subject === 'hero') rows = this.heroRows(plan, facts);
    else rows = this.matchRows(plan, facts);

    if (plan.subject !== 'match') {
      rows.sort((left, right) => {
        const a = left.value === null ? Number.NEGATIVE_INFINITY : number(left.value);
        const b = right.value === null ? Number.NEGATIVE_INFINITY : number(right.value);
        return plan.sortDirection === 'asc' ? a - b : b - a;
      });
    }
    rows = rows.slice(0, plan.limit);
    if (!rows.length) facts.warnings.push('当前条件下没有可用于回答的数据。');
    return {
      rows,
      metric: plan.metric,
      metricLabel: getMetric(plan.subject, plan.metric)?.label || '比赛结果',
      scope: {
        seasonId: scope.season?.id || null,
        seasonName: scope.season?.name || '全部赛事',
        stageId: scope.stage?.id || null,
        stageName: scope.stage?.name || '',
        matchCount: facts.matches.length,
        mapCount: facts.mapGames.length
      },
      coverage: facts.coverage,
      warnings: [...new Set(facts.warnings)],
      insufficient: !rows.length
    };
  }
}

module.exports = AnalyticsExecutor;
module.exports._private = { normalize, matchNames, coverageState };
