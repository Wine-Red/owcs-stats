const { Op } = require('sequelize');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const Hero = require('../models/Hero');
const Team = require('../models/Team');
const MapModel = require('../models/Map');
const Player = require('../models/Player');
const Season = require('../models/Season');

// 从原始比赛表（Match / MapGame / PlayerStat）实时计算赛季统计。
// 计算口径与已删除的旧预聚合实现（rebuildSeasonAggregates）保持一致，
// 返回结构对齐原预聚合表（SeasonPlayerStat / SeasonTeamScoreStat / SeasonMapPickStat）的行格式，
// 供读取接口直接返回，不再依赖预聚合表。

const integer = value => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;

const loadSeasonRawData = async (seasonId, options = {}) => {
  const requestedMatchIds = Array.isArray(options.matchIds)
    ? options.matchIds.map(Number).filter(Number.isFinite)
    : null;
  // 传入 matchIds 时仍叠加 seasonId 过滤（赛季内阶段流程的 matchIds 本就属于同一赛季）。
  const matchWhere = requestedMatchIds
    ? { seasonId, id: { [Op.in]: requestedMatchIds } }
    : { seasonId };
  const mapGameWhere = requestedMatchIds
    ? { seasonId, matchId: { [Op.in]: requestedMatchIds } }
    : { seasonId };
  const [matches, mapGames, teams, maps, players] = await Promise.all([
    Match.findAll({ where: matchWhere, raw: true }),
    MapGame.findAll({ where: mapGameWhere, raw: true }),
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
const calculateSeasonPlayerStats = async (seasonId, options = {}) => {
  const { playerStats, teamById, playerById, gameById } = await loadSeasonRawData(seasonId, options);

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
        finalBlows: 0,
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
    aggregate.finalBlows += integer(stat.finalBlows);
    aggregate.gameTime += Number(game.duration) || 0;
  }

  return Array.from(playerAggregateMap.values()).map(stat => {
    stat.kd = stat.deaths ? stat.elims / stat.deaths : stat.elims;
    stat.kad = stat.deaths ? (stat.elims + stat.assists) / stat.deaths : stat.elims + stat.assists;
    const minutes = stat.gameTime;
    for (const [source, target] of [
      ['elims', 'elimsPerMin'], ['assists', 'assistsPerMin'], ['deaths', 'deathsPerMin'],
      ['damage', 'damagePerMin'], ['healing', 'healingPerMin'], ['mitigation', 'mitigationPerMin'],
      ['finalBlows', 'finalBlowsPerMin']
    ]) stat[target] = minutes ? stat[source] / minutes : 0;
    stat.createdAt = null;
    stat.updatedAt = null;
    return stat;
  });
};

// 战队大场/小局战绩：每战队每赛季一行，结构对齐 SeasonTeamScoreStat（含嵌套 team）
const calculateSeasonTeamScoreStats = async (seasonId, options = {}) => {
  const { matches, teamById } = await loadSeasonRawData(seasonId, options);

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
// 从每名选手的英雄使用候选（按时长降序）中选出 5 个互不相同的英雄，使总使用时长最大。
// 用于“主力英雄撞车”时（例如两名辅助本局最长英雄都是朱诺）退而求其次选次英雄，
// 保证仍能拼出五人阵容。requireTddss 为 true 时仅接受 1 重装 + 2 输出 + 2 支援的合法阵容。
const pickBestDistinctComp = (candidateLists, heroRoleById, requireTddss = false) => {
  const players = candidateLists
    .filter(cands => cands && cands.length)
    .map(cands => cands.slice(0, 3))
    .sort((a, b) => b[0].seconds - a[0].seconds)
    .slice(0, 7);
  if (players.length < 5) return null;

  let best = null;
  const chosen = [];
  const used = new Set();

  const dfs = (playerIdx, picked, totalSeconds) => {
    if (picked === 5) {
      if (requireTddss) {
        const roleCounts = { tank: 0, damage: 0, support: 0 };
        for (const id of chosen) {
          const role = heroRoleById.get(id);
          if (!role || !(role in roleCounts)) return;
          roleCounts[role] += 1;
        }
        if (roleCounts.tank !== 1 || roleCounts.damage !== 2 || roleCounts.support !== 2) return;
      }
      if (!best || totalSeconds > best.seconds) {
        best = { heroIds: [...chosen], seconds: totalSeconds };
      }
      return;
    }
    if (players.length - playerIdx < 5 - picked) return;
    for (let i = playerIdx; i < players.length; i++) {
      for (const cand of players[i]) {
        if (used.has(cand.heroId)) continue;
        used.add(cand.heroId);
        chosen.push(cand.heroId);
        dfs(i + 1, picked + 1, totalSeconds + cand.seconds);
        chosen.pop();
        used.delete(cand.heroId);
      }
    }
  };
  dfs(0, 0, 0);
  return best;
};

const calculateSeasonMapPickStats = async (seasonId, options = {}) => {
  const { mapGames, mapById, playerStats, gameById } = await loadSeasonRawData(seasonId, options);

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
        compositions: [],
        map
      });
    }
    mapPickMap.get(map.id).pickCount++;
  }

  // 常见阵容：基于 player_hero_stats 的英雄使用时长，对每图每队的每局比赛取
  // “每名选手本局使用最久的英雄”拼成五人阵容（仅统计 1 重装 + 2 输出 + 2 支援的
  // 合法 TDDSS 阵容，以五人使用时长之和为权重），不分队伍按阵容累计在场时长，
  // 每张地图取时长最长的至多两套。旧赛季没有英雄明细数据时 compositions 为空数组。
  const playerStatIds = playerStats.map(s => s.id);
  const heroStatRows = playerStatIds.length
    ? await PlayerHeroStat.findAll({
      where: { playerStatId: { [Op.in]: playerStatIds } },
      raw: true
    })
    : [];

  if (heroStatRows.length) {
    const usageByPlayerStatId = new Map();
    for (const row of heroStatRows) {
      const psId = Number(row.playerStatId);
      if (!usageByPlayerStatId.has(psId)) usageByPlayerStatId.set(psId, []);
      usageByPlayerStatId.get(psId).push(row);
    }

    // playerStat 按（地图局, 队伍）分组
    const groupKey = (ps) => `${ps.mapGameId}_${ps.teamId}`;
    const psByGameAndTeam = new Map();
    for (const ps of playerStats) {
      const key = groupKey(ps);
      if (!psByGameAndTeam.has(key)) psByGameAndTeam.set(key, []);
      psByGameAndTeam.get(key).push(ps);
    }

    // 英雄职责表：用于校验 TDDSS（1 重装 + 2 输出 + 2 支援）合法阵容
    const allHeroes = await Hero.findAll({ attributes: ['id', 'role'], raw: true });
    const heroRoleById = new Map(allHeroes.map(h => [Number(h.id), h.role]));

    // mapId -> Map(compKey -> agg)，compKey 仅为英雄组合，不分队伍
    const compAggByMapId = new Map();
    for (const rows of psByGameAndTeam.values()) {
      const game = gameById.get(Number(rows[0].mapGameId));
      if (!game) continue;
      const mapId = Number(game.mapId);

      // 每名选手的英雄使用候选（按时长降序）
      const candidateLists = [];
      for (const ps of rows) {
        const usages = usageByPlayerStatId.get(Number(ps.id));
        if (!usages || !usages.length) continue;
        const cands = [];
        for (const u of usages) {
          const heroId = Number(u.heroId);
          const seconds = Number(u.usageSeconds) || 0;
          if (!Number.isFinite(heroId) || heroId <= 0 || seconds <= 0) continue;
          cands.push({ heroId, seconds });
        }
        if (cands.length) candidateLists.push(cands.sort((a, b) => b.seconds - a.seconds));
      }
      // 主力英雄撞车时退选次英雄，拼出五人互异且 TDDSS 合法、总时长最大的阵容
      const bestComp = pickBestDistinctComp(candidateLists, heroRoleById, true);
      if (!bestComp) continue;

      // 阵容内英雄按 T → D → S 顺序排列（同职责内按英雄 id）
      const roleRank = { tank: 0, damage: 1, support: 2 };
      const heroIds = [...bestComp.heroIds];
      heroIds.sort((a, b) => (roleRank[heroRoleById.get(a)] ?? 9) - (roleRank[heroRoleById.get(b)] ?? 9) || a - b);

      const compKey = heroIds.join(',');
      if (!compAggByMapId.has(mapId)) compAggByMapId.set(mapId, new Map());
      const byComp = compAggByMapId.get(mapId);
      if (!byComp.has(compKey)) byComp.set(compKey, { heroIds, seconds: 0, games: 0 });
      const agg = byComp.get(compKey);
      agg.seconds += bestComp.seconds;
      agg.games += 1;
    }

    for (const [mapId, byComp] of compAggByMapId) {
      const entry = mapPickMap.get(mapId);
      if (!entry) continue;
      entry.compositions = Array.from(byComp.values())
        .sort((a, b) => (b.seconds - a.seconds) || (b.games - a.games))
        .slice(0, 2)
        .map(agg => ({
          heroIds: agg.heroIds,
          seconds: Math.round(agg.seconds),
          games: agg.games
        }));
    }
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

// 队伍常用阵容：与地图常见阵容同口径（每局取每名选手使用最久的英雄拼五人阵容，
// 以五人使用时长之和为权重累计），但不按地图分组，直接对指定队伍在整赛季内
// 按累计在场时长排序，取至多三套。旧赛季没有英雄明细数据时返回空数组。
const calculateSeasonTeamCompositions = async (seasonId, teamId, options = {}) => {
  const targetTeamId = Number(teamId);
  if (!Number.isFinite(targetTeamId)) return [];
  const { playerStats, gameById } = await loadSeasonRawData(seasonId, options);

  const teamPlayerStats = playerStats.filter(ps => Number(ps.teamId) === targetTeamId);
  if (!teamPlayerStats.length) return [];

  const playerStatIds = teamPlayerStats.map(s => s.id);
  const heroStatRows = await PlayerHeroStat.findAll({
    where: { playerStatId: { [Op.in]: playerStatIds } },
    raw: true
  });
  if (!heroStatRows.length) return [];

  // 英雄职责表：用于阵容内按 T → D → S 排序
  const allHeroes = await Hero.findAll({ attributes: ['id', 'role'], raw: true });
  const heroRoleById = new Map(allHeroes.map(h => [Number(h.id), h.role]));
  const roleRank = { tank: 0, damage: 1, support: 2 };

  const usageByPlayerStatId = new Map();
  for (const row of heroStatRows) {
    const psId = Number(row.playerStatId);
    if (!usageByPlayerStatId.has(psId)) usageByPlayerStatId.set(psId, []);
    usageByPlayerStatId.get(psId).push(row);
  }

  const psByGame = new Map();
  for (const ps of teamPlayerStats) {
    const key = Number(ps.mapGameId);
    if (!psByGame.has(key)) psByGame.set(key, []);
    psByGame.get(key).push(ps);
  }

  const compAgg = new Map();
  for (const [mapGameId, rows] of psByGame) {
    if (!gameById.get(Number(mapGameId))) continue;
    // 每名选手的英雄使用候选（按时长降序）
    const candidateLists = [];
    for (const ps of rows) {
      const usages = usageByPlayerStatId.get(Number(ps.id));
      if (!usages || !usages.length) continue;
      const cands = [];
      for (const u of usages) {
        const heroId = Number(u.heroId);
        const seconds = Number(u.usageSeconds) || 0;
        if (!Number.isFinite(heroId) || heroId <= 0 || seconds <= 0) continue;
        cands.push({ heroId, seconds });
      }
      if (cands.length) candidateLists.push(cands.sort((a, b) => b.seconds - a.seconds));
    }
    // 主力英雄撞车时退选次英雄，拼出五人互异、总时长最大的阵容
    const bestComp = pickBestDistinctComp(candidateLists, heroRoleById, false);
    if (!bestComp) continue;
    // 阵容内英雄按 T → D → S 顺序排列（同职责内按英雄 id）
    const heroIds = [...bestComp.heroIds];
    heroIds.sort((a, b) => (roleRank[heroRoleById.get(a)] ?? 9) - (roleRank[heroRoleById.get(b)] ?? 9) || a - b);

    const compKey = heroIds.join(',');
    if (!compAgg.has(compKey)) compAgg.set(compKey, { heroIds, seconds: 0, games: 0, wins: 0 });
    const agg = compAgg.get(compKey);
    agg.seconds += bestComp.seconds;
    agg.games += 1;
    if (Number(gameById.get(Number(mapGameId))?.winnerId) === targetTeamId) agg.wins += 1;
  }

  return Array.from(compAgg.values())
    .sort((a, b) => (b.seconds - a.seconds) || (b.games - a.games))
    .slice(0, 3)
    .map(agg => ({
      heroIds: agg.heroIds,
      seconds: Math.round(agg.seconds),
      games: agg.games,
      wins: agg.wins,
      winRate: agg.games ? Math.round((agg.wins / agg.games) * 1000) / 10 : 0
    }));
};

// 队伍英雄数据：该队本赛季的英雄使用情况（按时长聚合）与 ban 倾向（我方 ban / 对手 ban）。
// 旧赛季没有英雄明细时 picks 为空数组；没有 ban 记录时 bans/bannedAgainst 为空数组。
const calculateSeasonTeamHeroStats = async (seasonId, teamId, options = {}) => {
  const targetTeamId = Number(teamId);
  if (!Number.isFinite(targetTeamId)) return { picks: [], bans: [], bannedAgainst: [] };
  const { playerStats, mapGames } = await loadSeasonRawData(seasonId, options);

  // 英雄使用：该队全部选手的英雄明细按英雄聚合
  const teamPlayerStats = playerStats.filter(ps => Number(ps.teamId) === targetTeamId);
  let picks = [];
  if (teamPlayerStats.length) {
    const heroStatRows = await PlayerHeroStat.findAll({
      where: { playerStatId: { [Op.in]: teamPlayerStats.map(s => s.id) } },
      raw: true
    });
    const agg = new Map();
    for (const row of heroStatRows) {
      const heroId = Number(row.heroId);
      if (!Number.isFinite(heroId) || heroId <= 0) continue;
      if (!agg.has(heroId)) agg.set(heroId, { heroId, seconds: 0, finalBlows: 0 });
      const entry = agg.get(heroId);
      entry.seconds += Number(row.usageSeconds) || 0;
      entry.finalBlows += Number(row.finalBlows) || 0;
    }
    const totalSeconds = Array.from(agg.values()).reduce((sum, entry) => sum + entry.seconds, 0);
    picks = Array.from(agg.values())
      .sort((a, b) => b.seconds - a.seconds)
      .map(entry => ({
        heroId: entry.heroId,
        seconds: Math.round(entry.seconds),
        finalBlows: entry.finalBlows,
        usagePct: totalSeconds > 0 ? Math.round((entry.seconds / totalSeconds) * 1000) / 10 : 0
      }));
  }

  // ban 倾向：我方 ban 的英雄 vs 对手 ban 的英雄
  const banCounts = new Map();
  const bannedAgainstCounts = new Map();
  for (const game of mapGames) {
    const isTeam1 = Number(game.team1Id) === targetTeamId;
    const isTeam2 = Number(game.team2Id) === targetTeamId;
    if (!isTeam1 && !isTeam2) continue;
    const ownBan = isTeam1 ? game.team1BanHeroId : game.team2BanHeroId;
    const opponentBan = isTeam1 ? game.team2BanHeroId : game.team1BanHeroId;
    if (ownBan) banCounts.set(Number(ownBan), (banCounts.get(Number(ownBan)) || 0) + 1);
    if (opponentBan) bannedAgainstCounts.set(Number(opponentBan), (bannedAgainstCounts.get(Number(opponentBan)) || 0) + 1);
  }
  const toBanList = counts => Array.from(counts.entries())
    .map(([heroId, count]) => ({ heroId, count }))
    .sort((a, b) => b.count - a.count);

  return {
    picks,
    bans: toBanList(banCounts),
    bannedAgainst: toBanList(bannedAgainstCounts)
  };
};

module.exports = {
  loadSeasonRawData,
  calculateSeasonPlayerStats,
  calculateSeasonTeamScoreStats,
  calculateSeasonMapPickStats,
  calculateSeasonTeamCompositions,
  calculateSeasonTeamHeroStats,
  calculatePlayerSeasonHistory
};
