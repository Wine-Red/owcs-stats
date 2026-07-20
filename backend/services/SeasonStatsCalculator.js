const { Op } = require('sequelize');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const Team = require('../models/Team');
const MapModel = require('../models/Map');
const Player = require('../models/Player');
const Season = require('../models/Season');

// 从原始比赛表（Match / MapGame / PlayerStat）实时计算赛季统计。
// 计算口径与已删除的旧预聚合实现（rebuildSeasonAggregates）保持一致，
// 返回结构对齐原预聚合表（SeasonPlayerStat / SeasonTeamScoreStat / SeasonMapPickStat）的行格式，
// 供读取接口直接返回，不再依赖预聚合表。

const integer = value => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;

const loadSeasonRawData = async (seasonId) => {
  const [matches, mapGames, teams, maps, players] = await Promise.all([
    Match.findAll({ where: { seasonId }, raw: true }),
    MapGame.findAll({ where: { seasonId }, raw: true }),
    Team.findAll({ raw: true }),
    MapModel.findAll({ raw: true }),
    Player.findAll({ raw: true })
  ]);
  const mapGameIds = mapGames.map(game => game.id);
  // 按主键顺序遍历，保证选手换队时“最后一支效力的队伍”口径与旧预聚合实现一致
  const playerStats = mapGameIds.length
    ? await PlayerStat.findAll({
      where: { mapGameId: { [Op.in]: mapGameIds } },
      order: [['id', 'ASC']],
      raw: true
    })
    : [];
  return {
    matches,
    mapGames,
    playerStats,
    teamById: new Map(teams.map(team => [Number(team.id), team])),
    mapById: new Map(maps.map(map => [Number(map.id), map])),
    playerById: new Map(players.map(player => [Number(player.id), player])),
    gameById: new Map(mapGames.map(game => [Number(game.id), game]))
  };
};

// 选手赛季聚合：每选手每赛季一行，结构对齐 SeasonPlayerStat（含嵌套 player / team）
const calculateSeasonPlayerStats = async (seasonId) => {
  const { playerStats, teamById, playerById, gameById } = await loadSeasonRawData(seasonId);

  const playerAggregateMap = new Map();
  for (const stat of playerStats) {
    const player = playerById.get(Number(stat.playerId));
    const team = teamById.get(Number(stat.teamId));
    const game = gameById.get(Number(stat.mapGameId));
    if (!player || !team || !game) continue;
    const key = `${player.id}_${player.role}`;
    if (!playerAggregateMap.has(key)) {
      playerAggregateMap.set(key, {
        id: null,
        seasonId: Number(seasonId),
        playerId: player.id,
        teamId: team.id,
        playerName: player.name,
        teamName: team.name,
        role: player.role,
        elims: 0,
        assists: 0,
        deaths: 0,
        damage: 0,
        healing: 0,
        mitigation: 0,
        gameTime: 0,
        player,
        team
      });
    }
    const aggregate = playerAggregateMap.get(key);
    // 选手换队时归属到该赛季最后一支效力的队伍（与旧预聚合实现口径一致）
    aggregate.teamId = team.id;
    aggregate.teamName = team.name;
    aggregate.team = team;
    aggregate.elims += integer(stat.kills);
    aggregate.assists += integer(stat.assists);
    aggregate.deaths += integer(stat.deaths);
    aggregate.damage += integer(stat.damage);
    aggregate.healing += integer(stat.healing);
    aggregate.mitigation += integer(stat.mitigation);
    aggregate.gameTime += Number(game.duration) || 0;
  }

  return Array.from(playerAggregateMap.values()).map(stat => {
    stat.kd = stat.deaths ? stat.elims / stat.deaths : stat.elims;
    stat.kad = stat.deaths ? (stat.elims + stat.assists) / stat.deaths : stat.elims + stat.assists;
    const minutes = stat.gameTime;
    for (const [source, target] of [
      ['elims', 'elimsPerMin'], ['assists', 'assistsPerMin'], ['deaths', 'deathsPerMin'],
      ['damage', 'damagePerMin'], ['healing', 'healingPerMin'], ['mitigation', 'mitigationPerMin']
    ]) stat[target] = minutes ? stat[source] / minutes : 0;
    stat.createdAt = null;
    stat.updatedAt = null;
    return stat;
  });
};

// 战队大场/小局战绩：每战队每赛季一行，结构对齐 SeasonTeamScoreStat（含嵌套 team）
const calculateSeasonTeamScoreStats = async (seasonId) => {
  const { matches, teamById } = await loadSeasonRawData(seasonId);

  const teamScoreMap = new Map();
  const ensureTeamScore = id => {
    const team = teamById.get(Number(id));
    if (!team) return null;
    if (!teamScoreMap.has(Number(id))) {
      teamScoreMap.set(Number(id), {
        id: null,
        seasonId: Number(seasonId),
        teamId: team.id,
        teamName: team.name,
        teamShortName: team.shortName || team.short || null,
        matchWin: 0,
        matchLoss: 0,
        matchDiff: 0,
        mapWin: 0,
        mapLoss: 0,
        mapDiff: 0,
        team
      });
    }
    return teamScoreMap.get(Number(id));
  };
  for (const match of matches) {
    const a = ensureTeamScore(match.team1Id);
    const b = ensureTeamScore(match.team2Id);
    if (!a || !b) continue;
    const scoreA = integer(match.team1Score);
    const scoreB = integer(match.team2Score);
    if (scoreA > scoreB) { a.matchWin++; b.matchLoss++; }
    else if (scoreB > scoreA) { b.matchWin++; a.matchLoss++; }
    a.mapWin += scoreA; a.mapLoss += scoreB;
    b.mapWin += scoreB; b.mapLoss += scoreA;
  }
  for (const item of teamScoreMap.values()) {
    item.matchDiff = item.matchWin - item.matchLoss;
    item.mapDiff = item.mapWin - item.mapLoss;
  }
  return Array.from(teamScoreMap.values());
};

// 地图选取统计：每地图每赛季一行，结构对齐 SeasonMapPickStat（含嵌套 map）
const calculateSeasonMapPickStats = async (seasonId) => {
  const { mapGames, mapById } = await loadSeasonRawData(seasonId);

  const mapPickMap = new Map();
  for (const game of mapGames) {
    const map = mapById.get(Number(game.mapId));
    if (!map) continue;
    if (!mapPickMap.has(map.id)) {
      mapPickMap.set(map.id, {
        id: null,
        seasonId: Number(seasonId),
        mapId: map.id,
        mapName: map.name,
        mapType: map.type,
        pickCount: 0,
        map
      });
    }
    mapPickMap.get(map.id).pickCount++;
  }
  return Array.from(mapPickMap.values());
};

// 选手跨赛季履历：每赛季一行，结构对齐原 SeasonPlayerStat 查询（含嵌套 season / team），
// 用于选手详情页 seasonHistory；同样从原始比赛表实时计算。
const calculatePlayerSeasonHistory = async (playerId) => {
  const player = await Player.findByPk(playerId, { raw: true });
  if (!player) return [];
  const playerStats = await PlayerStat.findAll({
    where: { playerId },
    order: [['id', 'ASC']],
    raw: true
  });
  if (!playerStats.length) return [];
  const mapGameIds = [...new Set(playerStats.map(stat => stat.mapGameId))];
  const [mapGames, teams, seasons] = await Promise.all([
    MapGame.findAll({ where: { id: { [Op.in]: mapGameIds } }, raw: true }),
    Team.findAll({ raw: true }),
    Season.findAll({ raw: true })
  ]);
  const gameById = new Map(mapGames.map(game => [Number(game.id), game]));
  const teamById = new Map(teams.map(team => [Number(team.id), team]));
  const seasonById = new Map(seasons.map(season => [Number(season.id), season]));

  const bySeasonMap = new Map();
  for (const stat of playerStats) {
    const game = gameById.get(Number(stat.mapGameId));
    const team = teamById.get(Number(stat.teamId));
    if (!game || !team || game.seasonId == null) continue;
    const seasonId = Number(game.seasonId);
    if (!bySeasonMap.has(seasonId)) {
      bySeasonMap.set(seasonId, {
        id: null,
        seasonId,
        playerId: player.id,
        teamId: team.id,
        playerName: player.name,
        teamName: team.name,
        role: player.role,
        elims: 0,
        assists: 0,
        deaths: 0,
        damage: 0,
        healing: 0,
        mitigation: 0,
        gameTime: 0
      });
    }
    const aggregate = bySeasonMap.get(seasonId);
    // 选手换队时归属到该赛季最后一支效力的队伍
    aggregate.teamId = team.id;
    aggregate.teamName = team.name;
    aggregate.elims += integer(stat.kills);
    aggregate.assists += integer(stat.assists);
    aggregate.deaths += integer(stat.deaths);
    aggregate.damage += integer(stat.damage);
    aggregate.healing += integer(stat.healing);
    aggregate.mitigation += integer(stat.mitigation);
    aggregate.gameTime += Number(game.duration) || 0;
  }

  return Array.from(bySeasonMap.values())
    .filter(row => seasonById.has(row.seasonId))
    .sort((a, b) => a.seasonId - b.seasonId)
    .map(stat => {
      stat.kd = stat.deaths ? stat.elims / stat.deaths : stat.elims;
      stat.kad = stat.deaths ? (stat.elims + stat.assists) / stat.deaths : stat.elims + stat.assists;
      const minutes = stat.gameTime;
      for (const [source, target] of [
        ['elims', 'elimsPerMin'], ['assists', 'assistsPerMin'], ['deaths', 'deathsPerMin'],
        ['damage', 'damagePerMin'], ['healing', 'healingPerMin'], ['mitigation', 'mitigationPerMin']
      ]) stat[target] = minutes ? stat[source] / minutes : 0;
      stat.createdAt = null;
      stat.updatedAt = null;
      const season = seasonById.get(stat.seasonId);
      const team = teamById.get(Number(stat.teamId));
      stat.season = season
        ? { id: season.id, name: season.name, stage: season.stage, status: season.status }
        : null;
      stat.team = team
        ? { id: team.id, name: team.name, logo: team.logo, region: team.region }
        : null;
      return stat;
    });
};

module.exports = {
  loadSeasonRawData,
  calculateSeasonPlayerStats,
  calculateSeasonTeamScoreStats,
  calculateSeasonMapPickStats,
  calculatePlayerSeasonHistory
};
