const { Op } = require('sequelize');
const Player = require('../models/Player');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const MapGame = require('../models/MapGame');
const Match = require('../models/Match');
const MapModel = require('../models/Map');
const Hero = require('../models/Hero');
const Team = require('../models/Team');
const SeasonStatsCalculator = require('./SeasonStatsCalculator');

// Both HTTP controllers and the static exporter call these functions. rawData is
// the exporter's already-read transaction snapshot; it never changes the formulas.
const plain = row => row?.get ? row.get({ plain: true }) : row;
const number = value => Number(value) || 0;
const select = (row, keys) => row ? Object.fromEntries(keys.map(key => [key, row[key]])) : null;

const buildPlayerProfile = ({ player, rows, seasonHistory }) => {
  const heroGroups = new Map();
  const totals = {
    mapsPlayed: rows.length,
    duration: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damage: 0,
    healing: 0,
    mitigation: 0,
    finalBlows: 0
  };

  const appearances = rows.map(data => {
    const mapGame = data.MapGame || {};
    const match = mapGame.Match || {};
    const map = mapGame.Map || {};
    const duration = number(mapGame.duration);
    totals.duration += duration;
    totals.kills += number(data.kills);
    totals.deaths += number(data.deaths);
    totals.assists += number(data.assists);
    totals.damage += number(data.damage);
    totals.healing += number(data.healing);
    totals.mitigation += number(data.mitigation);
    totals.finalBlows += number(data.finalBlows);

    const heroKey = data.heroId || 'unknown';
    const heroEntry = heroGroups.get(heroKey) || {
      heroId: data.heroId || null,
      heroName: data.hero?.name || '未记录英雄',
      subRole: data.hero?.subRole || '',
      mapsPlayed: 0,
      duration: 0,
      kills: 0,
      deaths: 0,
      assists: 0
    };
    heroEntry.mapsPlayed += 1;
    heroEntry.duration += duration;
    heroEntry.kills += number(data.kills);
    heroEntry.deaths += number(data.deaths);
    heroEntry.assists += number(data.assists);
    heroGroups.set(heroKey, heroEntry);

    const opponentId = String(mapGame.team1Id) === String(data.teamId)
      ? mapGame.team2Id
      : mapGame.team1Id;
    return {
      id: data.id,
      matchId: mapGame.matchId || null,
      matchDate: match.matchDate || mapGame.createdAt || null,
      mapGameId: mapGame.id || data.mapGameId,
      mapId: map.id || mapGame.mapId || null,
      mapName: map.name || '未知地图',
      mapType: map.type || '',
      teamId: data.teamId,
      team: select(data.team, ['id', 'name', 'logo', 'region']),
      opponentId,
      winnerId: mapGame.winnerId || match.winnerId || null,
      matchWinnerId: match.winnerId || null,
      matchTeam1Id: match.team1Id || null,
      matchTeam2Id: match.team2Id || null,
      matchTeam1Score: match.team1Score ?? null,
      matchTeam2Score: match.team2Score ?? null,
      boFormat: match.boFormat || '',
      hero: select(data.hero, ['id', 'name', 'role', 'subRole']),
      duration,
      kills: number(data.kills),
      deaths: number(data.deaths),
      assists: number(data.assists),
      damage: number(data.damage),
      healing: number(data.healing),
      mitigation: number(data.mitigation)
    };
  });

  appearances.sort((a, b) => {
    const dateDiff = new Date(b.matchDate || 0) - new Date(a.matchDate || 0);
    return dateDiff || Number(b.mapGameId || 0) - Number(a.mapGameId || 0);
  });

  const heroPool = Array.from(heroGroups.values())
    .map(item => ({
      ...item,
      usageRate: totals.duration > 0 ? Number((item.duration / totals.duration * 100).toFixed(1)) : 0,
      kd: item.deaths > 0 ? Number((item.kills / item.deaths).toFixed(2)) : item.kills
    }))
    .sort((a, b) => b.duration - a.duration);

  return { player, totals, heroPool, recentMaps: appearances.slice(0, 12), seasonHistory };
};

const getPlayerProfile = async (playerId, { seasonId = null, rawData } = {}) => {
  const player = rawData ? rawData.playerById.get(Number(playerId)) : await Player.findByPk(playerId);
  if (!player) return null;
  let rows, seasonHistory;
  if (rawData) {
    rows = rawData.playerStats.filter(row => Number(row.playerId) === Number(playerId)
      && (!Number.isFinite(seasonId) || Number(rawData.gameById.get(Number(row.mapGameId))?.seasonId) === seasonId));
    seasonHistory = await SeasonStatsCalculator.calculatePlayerSeasonHistory(playerId, { rawData });
  } else {
    const where = { playerId };
    if (Number.isFinite(seasonId)) {
      const mapGames = await MapGame.findAll({ where: { seasonId }, attributes: ['id'] });
      where.mapGameId = { [Op.in]: mapGames.map(item => item.id) };
    }
    [rows, seasonHistory] = await Promise.all([
      PlayerStat.findAll({
        where,
        include: [
          { model: Hero, as: 'hero', attributes: ['id', 'name', 'role', 'subRole'] },
          { model: Team, as: 'team', attributes: ['id', 'name', 'logo', 'region'] },
          {
            model: MapGame,
            attributes: ['id', 'seasonId', 'matchId', 'mapId', 'team1Id', 'team2Id', 'winnerId', 'duration', 'createdAt'],
            include: [
              { model: Match, attributes: ['id', 'matchDate', 'team1Id', 'team2Id', 'winnerId', 'team1Score', 'team2Score', 'boFormat'] },
              { model: MapModel, attributes: ['id', 'name', 'type'] }
            ]
          }
        ]
      }),
      SeasonStatsCalculator.calculatePlayerSeasonHistory(playerId)
    ]);
  }
  return buildPlayerProfile({ player: plain(player), rows: rows.map(plain), seasonHistory });
};

// Only data loading differs. Filtering, joins, order and every aggregation below
// are shared, including NULL handling and the latest player-stat team attribution.
const loadSeasonData = async (seasonId, { rawData, playerId, heroId } = {}) => {
  let mapGames, playerStats, playerHeroStats;
  if (rawData) ({ mapGames, playerStats, playerHeroStats } = rawData);
  else {
    mapGames = await MapGame.findAll({ where: { seasonId }, raw: true });
    const gameIds = mapGames.map(game => game.id);
    playerStats = gameIds.length ? await PlayerStat.findAll({
      where: { mapGameId: { [Op.in]: gameIds }, ...(playerId === undefined ? {} : { playerId }) }, raw: true
    }) : [];
    const statIds = playerStats.map(stat => stat.id);
    playerHeroStats = statIds.length ? await PlayerHeroStat.findAll({
      where: { playerStatId: { [Op.in]: statIds }, ...(heroId === undefined ? {} : { heroId }) }, raw: true
    }) : [];
  }
  mapGames = mapGames.filter(game => Number(game.seasonId) === Number(seasonId));
  const gameById = new Map(mapGames.map(game => [Number(game.id), game]));
  playerStats = playerStats.filter(stat => gameById.has(Number(stat.mapGameId))
    && (playerId === undefined || Number(stat.playerId) === Number(playerId)));
  const statById = new Map(playerStats.map(stat => [Number(stat.id), stat]));
  const rows = [];
  for (const heroStat of playerHeroStats) {
    const stat = statById.get(Number(heroStat.playerStatId));
    if (!stat || (heroId !== undefined && (heroStat.heroId == null || Number(heroStat.heroId) !== Number(heroId)))) continue;
    rows.push({ ...heroStat, playerId: stat.playerId, teamId: stat.teamId, mapGameId: stat.mapGameId,
      winnerId: gameById.get(Number(stat.mapGameId)).winnerId });
  }
  rows.sort((a, b) => Number(a.playerStatId) - Number(b.playerStatId) || Number(a.id) - Number(b.id));
  return { mapGames, playerStats, rows };
};

const getHeroOverview = async (seasonId, options = {}) => {
  const { mapGames, rows } = await loadSeasonData(seasonId, options);
  const heroes = options.rawData?.heroes || await Hero.findAll({ raw: true });
  const heroById = new Map(heroes.map(hero => [Number(hero.id), hero]));
  const byHero = new Map();
  for (const row of rows) {
    if (row.heroId == null) continue;
    const heroId = Number(row.heroId);
    if (!byHero.has(heroId)) byHero.set(heroId, { heroId, heroName: row.heroName,
      maps: new Set(), picks: new Set(), usageSeconds: 0, finalBlows: 0, deathsByFinalBlow: 0,
      ultReady: 0, ultUsed: 0, chargeSum: 0, chargeCount: 0, winPicks: 0 });
    const item = byHero.get(heroId);
    if (String(row.heroName || '') > String(item.heroName || '')) item.heroName = row.heroName;
    item.maps.add(Number(row.mapGameId));
    item.picks.add(Number(row.playerStatId));
    for (const key of ['usageSeconds', 'finalBlows', 'deathsByFinalBlow', 'ultReady', 'ultUsed']) item[key] += number(row[key]);
    if (row.avgUltChargeSeconds != null) { item.chargeSum += number(row.avgUltChargeSeconds); item.chargeCount++; }
    if (row.winnerId != null && row.teamId != null && Number(row.winnerId) === Number(row.teamId)) item.winPicks++;
  }
  const bans = new Map();
  for (const game of mapGames) for (const id of [game.team1BanHeroId, game.team2BanHeroId]) {
    if (id != null) bans.set(Number(id), (bans.get(Number(id)) || 0) + 1);
  }
  const totalMapGames = mapGames.length;
  const data = [...new Set([...byHero.keys(), ...bans.keys()])].sort((a, b) => a - b).map(heroId => {
    const item = byHero.get(heroId), hero = heroById.get(heroId);
    const pickCount = item?.picks.size || 0, mapsAppeared = item?.maps.size || 0;
    const usageSeconds = item?.usageSeconds || 0, finalBlows = item?.finalBlows || 0;
    const banCount = bans.get(heroId) || 0;
    return { heroId, heroName: hero?.name || item?.heroName || '未知英雄', role: hero?.role || null, subRole: hero?.subRole || null,
      pickCount, mapsAppeared, pickRate: totalMapGames ? mapsAppeared / totalMapGames : 0,
      banCount, banRate: totalMapGames ? banCount / totalMapGames : 0,
      winRate: pickCount ? (item?.winPicks || 0) / pickCount : 0, usageSeconds, finalBlows,
      finalBlowsPer10: usageSeconds ? finalBlows / (usageSeconds / 60) * 10 : 0,
      deathsByFinalBlow: item?.deathsByFinalBlow || 0, ultReady: item?.ultReady || 0, ultUsed: item?.ultUsed || 0,
      avgUltChargeSeconds: item?.chargeCount ? item.chargeSum / item.chargeCount : null };
  });
  return { data, totalMapGames };
};

const getHeroPlayers = async (seasonId, heroId, options = {}) => {
  const { rows } = await loadSeasonData(seasonId, { ...options, heroId });
  const players = options.rawData?.players || await Player.findAll({ raw: true });
  // 按选手聚合（跨该赛季所有使用该英雄的地图局）
  const byPlayer = {};
  for (const r of rows) {
    const pid = Number(r.playerId);
    if (!byPlayer[pid]) {
      byPlayer[pid] = {
        playerId: pid,
        teamId: Number(r.teamId),
        usageSeconds: 0,
        finalBlows: 0,
        deathsByFinalBlow: 0,
        ultWeightedSum: 0,
        ultWeight: 0,
        mapIds: new Set()
      };
    }
    const agg = byPlayer[pid];
    const usage = Number(r.usageSeconds) || 0;
    agg.usageSeconds += usage;
    agg.finalBlows += Number(r.finalBlows) || 0;
    agg.deathsByFinalBlow += Number(r.deathsByFinalBlow) || 0;
    if (r.avgUltChargeSeconds !== null && r.avgUltChargeSeconds !== undefined && usage > 0) {
      agg.ultWeightedSum += Number(r.avgUltChargeSeconds) * usage;
      agg.ultWeight += usage;
    }
    agg.mapIds.add(Number(r.mapGameId));
    // 选手换队时归属最新一条记录的队伍
    agg.teamId = Number(r.teamId);
  }

  const nameById = {};
  players.forEach(pl => { nameById[Number(pl.id)] = pl.name; });

  const data = Object.values(byPlayer).map(agg => {
    const minutes = agg.usageSeconds / 60;
    return {
      playerId: agg.playerId,
      playerName: nameById[agg.playerId] || `选手#${agg.playerId}`,
      teamId: agg.teamId,
      usageSeconds: agg.usageSeconds,
      mapsPlayed: agg.mapIds.size,
      finalBlows: agg.finalBlows,
      finalBlowsPer10: minutes ? agg.finalBlows / minutes * 10 : 0,
      fbPerDeath: agg.deathsByFinalBlow > 0 ? agg.finalBlows / agg.deathsByFinalBlow : null,
      avgUltChargeSeconds: agg.ultWeight > 0 ? agg.ultWeightedSum / agg.ultWeight : null
    };
  }).sort((a, b) => (b.finalBlowsPer10 - a.finalBlowsPer10) || (b.usageSeconds - a.usageSeconds));

  return { data };
};

const getPlayerHeroes = async (seasonId, playerId, options = {}) => {
  const { rows } = await loadSeasonData(seasonId, { ...options, playerId });
  // 按英雄聚合（跨该赛季该选手所有地图局）
  const byHero = {};
  for (const r of rows) {
    const hid = Number(r.heroId);
    if (!byHero[hid]) {
      byHero[hid] = {
        heroId: hid,
        usageSeconds: 0,
        finalBlows: 0,
        deathsByFinalBlow: 0,
        ultWeightedSum: 0,
        ultWeight: 0,
        mapIds: new Set()
      };
    }
    const agg = byHero[hid];
    const usage = Number(r.usageSeconds) || 0;
    agg.usageSeconds += usage;
    agg.finalBlows += Number(r.finalBlows) || 0;
    agg.deathsByFinalBlow += Number(r.deathsByFinalBlow) || 0;
    if (r.avgUltChargeSeconds !== null && r.avgUltChargeSeconds !== undefined && usage > 0) {
      agg.ultWeightedSum += Number(r.avgUltChargeSeconds) * usage;
      agg.ultWeight += usage;
    }
    agg.mapIds.add(Number(r.mapGameId));
  }

  const data = Object.values(byHero).map(agg => {
    const minutes = agg.usageSeconds / 60;
    return {
      heroId: agg.heroId,
      usageSeconds: agg.usageSeconds,
      mapsPlayed: agg.mapIds.size,
      finalBlows: agg.finalBlows,
      finalBlowsPer10: minutes ? agg.finalBlows / minutes * 10 : 0,
      fbPerDeath: agg.deathsByFinalBlow > 0 ? agg.finalBlows / agg.deathsByFinalBlow : null,
      avgUltChargeSeconds: agg.ultWeight > 0 ? agg.ultWeightedSum / agg.ultWeight : null
    };
  }).sort((a, b) => b.usageSeconds - a.usageSeconds);

  return { data };
};

const getSeasonFeatures = async (seasonId, options = {}) => {
  const { mapGames, playerStats, rows } = await loadSeasonData(seasonId, options);
  return {
    seasonId: Number(seasonId), totalMapGames: mapGames.length,
    hasBans: mapGames.some(game => game.team1BanHeroId != null || game.team2BanHeroId != null),
    hasHeroStats: rows.length > 0,
    hasFinalBlows: playerStats.some(stat => number(stat.finalBlows) > 0),
    hasUltCharge: rows.some(row => row.avgUltChargeSeconds != null || number(row.ultReady) > 0 || number(row.ultUsed) > 0)
  };
};

module.exports = { getPlayerProfile, getHeroOverview, getHeroPlayers, getPlayerHeroes, getSeasonFeatures };
