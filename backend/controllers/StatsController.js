const { Op, Sequelize } = require('sequelize');
const PlayerStat = require('../models/PlayerStat');
const Player = require('../models/Player');
const Team = require('../models/Team');
const MapGame = require('../models/MapGame');
const Match = require('../models/Match');
const Map = require('../models/Map');
const Hero = require('../models/Hero');
const sequelize = require('../config/database');
const SeasonStatsCalculator = require('../services/SeasonStatsCalculator');

const StatsController = {
  // Aggregate the data used by the public player profile page.
  getPlayerProfile: async (req, res) => {
    try {
      const playerId = Number(req.params.playerId);
      const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;

      if (!Number.isFinite(playerId)) {
        return res.status(400).json({ error: 'Invalid player ID' });
      }

      const player = await Player.findByPk(playerId);
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      const where = { playerId };
      if (Number.isFinite(seasonId)) {
        const mapGames = await MapGame.findAll({
          where: { seasonId },
          attributes: ['id']
        });
        where.mapGameId = { [Op.in]: mapGames.map(item => item.id) };
      }

      const [rows, seasonHistory] = await Promise.all([
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
                { model: Map, attributes: ['id', 'name', 'type'] }
              ]
            }
          ]
        }),
        // 赛季履历改为从原始比赛表实时计算，不再读预聚合表
        SeasonStatsCalculator.calculatePlayerSeasonHistory(playerId)
      ]);

      const heroGroups = new global.Map();
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

      const appearances = rows.map(row => {
        const data = row.get({ plain: true });
        const mapGame = data.MapGame || {};
        const match = mapGame.Match || {};
        const map = mapGame.Map || {};
        const duration = Number(mapGame.duration) || 0;

        totals.duration += duration;
        totals.kills += Number(data.kills) || 0;
        totals.deaths += Number(data.deaths) || 0;
        totals.assists += Number(data.assists) || 0;
        totals.damage += Number(data.damage) || 0;
        totals.healing += Number(data.healing) || 0;
        totals.mitigation += Number(data.mitigation) || 0;
        totals.finalBlows += Number(data.finalBlows) || 0;

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
        heroEntry.kills += Number(data.kills) || 0;
        heroEntry.deaths += Number(data.deaths) || 0;
        heroEntry.assists += Number(data.assists) || 0;
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
          team: data.team || null,
          opponentId,
          winnerId: mapGame.winnerId || match.winnerId || null,
          matchWinnerId: match.winnerId || null,
          matchTeam1Id: match.team1Id || null,
          matchTeam2Id: match.team2Id || null,
          matchTeam1Score: match.team1Score ?? null,
          matchTeam2Score: match.team2Score ?? null,
          boFormat: match.boFormat || '',
          hero: data.hero || null,
          duration,
          kills: Number(data.kills) || 0,
          deaths: Number(data.deaths) || 0,
          assists: Number(data.assists) || 0,
          damage: Number(data.damage) || 0,
          healing: Number(data.healing) || 0,
          mitigation: Number(data.mitigation) || 0
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

      return res.status(200).json({
        player,
        totals,
        heroPool,
        recentMaps: appearances.slice(0, 12),
        seasonHistory
      });
    } catch (error) {
      console.error('Failed to get player profile:', error);
      return res.status(500).json({ error: error.message });
    }
  },
  // 获取选手统计数据
  getPlayerStats: async (req, res) => {
    try {
      const { playerId, seasonId, teamIds, role } = req.query;
      
      const where = {};
      
      if (seasonId) {
        // 获取赛季的所有地图局
        const mapGames = await MapGame.findAll({ where: { seasonId } });
        const mapGameIds = mapGames.map(mg => mg.id);
        where.mapGameId = { [Op.in]: mapGameIds };
      }
      
      if (teamIds) {
        const ids = Array.isArray(teamIds) ? teamIds : [teamIds];
        where.teamId = { [Op.in]: ids };
      }

      if (playerId) {
        where.playerId = playerId;
      }
      
      const playerInclude = {
        model: Player,
        as: 'player',
        attributes: ['id', 'name', 'role']
      };
      
      if (role) {
        playerInclude.where = { role };
      }
      
      const playerStats = await PlayerStat.findAll({ 
        where,
        include: [
          playerInclude,
          { model: Team, as: 'team', attributes: ['id', 'name', 'logo'] },
          { model: MapGame, attributes: [] }
        ],
        attributes: [
          'playerId',
          'teamId',
          [Sequelize.fn('SUM', Sequelize.col('kills')), 'totalKills'],
          [Sequelize.fn('SUM', Sequelize.col('deaths')), 'totalDeaths'],
          [Sequelize.fn('SUM', Sequelize.col('assists')), 'totalAssists'],
          [Sequelize.fn('SUM', Sequelize.col('damage')), 'totalDamage'],
          [Sequelize.fn('SUM', Sequelize.col('healing')), 'totalHealing'],
          [Sequelize.fn('SUM', Sequelize.col('mitigation')), 'totalMitigation'],
          [Sequelize.fn('SUM', Sequelize.col('MapGame.duration')), 'totalDuration']
        ],
        group: ['playerId', 'teamId', 'player.id', 'player.name', 'player.role', 'team.id', 'team.name', 'team.logo']
      });
      
      res.status(200).json(playerStats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  
  // 获取英雄禁用统计数据
  getHeroBanStats: async (req, res) => {
    try {
      const { seasonId } = req.query;
      
      if (!seasonId) {
        return res.status(400).json({ error: 'Season ID is required' });
      }
      
      // 获取赛季的所有地图局
      const mapGames = await MapGame.findAll({ where: { seasonId } });
      const totalGames = mapGames.length;
      
      // 统计英雄禁用数据
      const banStats = {};
      
      // 遍历所有地图局，统计禁用次数
      for (const game of mapGames) {
        if (game.team1BanHeroId) {
          banStats[game.team1BanHeroId] = (banStats[game.team1BanHeroId] || 0) + 1;
        }
        if (game.team2BanHeroId) {
          banStats[game.team2BanHeroId] = (banStats[game.team2BanHeroId] || 0) + 1;
        }
      }
      
      // 转换为数组并排序
      const banStatsArray = Object.entries(banStats).map(([heroId, banCount]) => ({
        heroId: parseInt(heroId),
        banCount,
        banRate: totalGames > 0 ? (banCount / totalGames * 100).toFixed(2) : 0
      }));
      
      // 按禁用次数降序排序，取前10名
      banStatsArray.sort((a, b) => b.banCount - a.banCount);
      const topBanStats = banStatsArray.slice(0, 10);
      
      // 关联英雄信息
      const Hero = require('../models/Hero');
      const topBanStatsWithHero = await Promise.all(
        topBanStats.map(async (stat) => {
          const hero = await Hero.findByPk(stat.heroId);
          return {
            ...stat,
            heroName: hero ? hero.name : '未知英雄'
          };
        })
      );
      
      res.status(200).json({
        data: topBanStatsWithHero,
        totalGames,
        totalBans: Object.values(banStats).reduce((sum, count) => sum + count, 0)
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取队伍统计数据
  getTeamStats: async (req, res) => {
    try {
      const { seasonId, teamIds } = req.query;
      
      const where = {};
      if (seasonId) {
        const mapGames = await MapGame.findAll({ where: { seasonId } });
        const mapGameIds = mapGames.map(mg => mg.id);
        where.mapGameId = { [Op.in]: mapGameIds };
      }
      
      // Filter by teamIds if provided
      if (teamIds) {
        // teamIds can be an array or a single value
        const ids = Array.isArray(teamIds) ? teamIds : [teamIds];
        where.teamId = { [Op.in]: ids };
      }
      
      // 聚合队伍数据
      const stats = await PlayerStat.findAll({
        where,
        include: ['team'],
        attributes: [
          'teamId',
          [Sequelize.fn('SUM', Sequelize.col('kills')), 'totalKills'],
          [Sequelize.fn('SUM', Sequelize.col('deaths')), 'totalDeaths'],
          [Sequelize.fn('SUM', Sequelize.col('assists')), 'totalAssists'],
          [Sequelize.fn('SUM', Sequelize.col('damage')), 'totalDamage'],
          [Sequelize.fn('SUM', Sequelize.col('healing')), 'totalHealing'],
          [Sequelize.fn('SUM', Sequelize.col('mitigation')), 'totalMitigation'],
          [Sequelize.fn('SUM', Sequelize.col('ultsUsed')), 'totalUltsUsed'],
          [Sequelize.fn('SUM', Sequelize.col('finalBlows')), 'totalFinalBlows']
        ],
        group: ['teamId']
      });
      
      // Calculate total duration for each team
      const statsWithDuration = await Promise.all(stats.map(async (stat) => {
        const teamId = stat.teamId;
        const durationWhere = {};
        if (seasonId) durationWhere.seasonId = seasonId;
        
        // A team plays if it is team1 or team2
        durationWhere[Op.or] = [
            { team1Id: teamId },
            { team2Id: teamId }
        ];

        // This is sum of all game durations the team played.
        // But for per 10min calculation:
        // (Team Total Damage / (Team Total Duration / 600))
        // Team Total Damage is sum of 5 players' damage.
        // Team Total Duration in seconds is game_duration * 5 (since 5 players play simultaneously).
        // Wait, "Team Total Duration" usually means the sum of time the team played the game.
        // Let's look at the formula user provided: (该队伍所有队员的总伤害/总时长（分钟）)*10
        // "总时长（分钟）" usually refers to the game time the team played.
        // Example: Team played 10 mins. Total Damage = 10000 (sum of 5 players).
        // Damage/10min = (10000 / 10) * 10 = 10000.
        // This means we just need the sum of game durations for the team.
        // The current implementation calculates exactly that: sum('duration') where team played.
        
        const totalDuration = await MapGame.sum('duration', { where: durationWhere });
        
        // Clone the stat object and add totalDuration
        const statPlain = stat.get({ plain: true });
        statPlain.totalDuration = totalDuration || 0;
        return statPlain;
      }));
      
      res.status(200).json(statsWithDuration);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取赛季统计数据
  getSeasonStats: async (req, res) => {
    try {
      const { seasonId } = req.query;
      
      // 获取赛季的所有地图局
      const mapGames = await MapGame.findAll({ where: { seasonId } });
      const mapGameIds = mapGames.map(mg => mg.id);
      
      // 聚合数据
      const stats = await PlayerStat.findAll({
        where: { mapGameId: { [Op.in]: mapGameIds } },
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('kills')), 'totalKills'],
          [Sequelize.fn('SUM', Sequelize.col('deaths')), 'totalDeaths'],
          [Sequelize.fn('SUM', Sequelize.col('assists')), 'totalAssists'],
          [Sequelize.fn('SUM', Sequelize.col('damage')), 'totalDamage'],
          [Sequelize.fn('SUM', Sequelize.col('healing')), 'totalHealing'],
          [Sequelize.fn('SUM', Sequelize.col('mitigation')), 'totalMitigation'],
          [Sequelize.fn('SUM', Sequelize.col('ultsUsed')), 'totalUltsUsed'],
          [Sequelize.fn('SUM', Sequelize.col('finalBlows')), 'totalFinalBlows']
        ]
      });
      
      res.status(200).json(stats[0] || {});
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取英雄统计数据
  getHeroStats: async (req, res) => {
    try {
      const { heroId, seasonId } = req.query;
      
      const where = {};
      if (heroId) where.heroId = heroId;
      if (seasonId) {
        const mapGames = await MapGame.findAll({ where: { seasonId } });
        const mapGameIds = mapGames.map(mg => mg.id);
        where.mapGameId = { [Op.in]: mapGameIds };
      }
      
      // 聚合英雄数据
      const stats = await PlayerStat.findAll({
        where,
        include: ['hero'],
        attributes: [
          'heroId',
          [Sequelize.fn('SUM', Sequelize.col('kills')), 'totalKills'],
          [Sequelize.fn('SUM', Sequelize.col('deaths')), 'totalDeaths'],
          [Sequelize.fn('SUM', Sequelize.col('assists')), 'totalAssists'],
          [Sequelize.fn('SUM', Sequelize.col('damage')), 'totalDamage'],
          [Sequelize.fn('SUM', Sequelize.col('healing')), 'totalHealing'],
          [Sequelize.fn('SUM', Sequelize.col('mitigation')), 'totalMitigation'],
          [Sequelize.fn('SUM', Sequelize.col('ultsUsed')), 'totalUltsUsed'],
          [Sequelize.fn('SUM', Sequelize.col('finalBlows')), 'totalFinalBlows']
        ],
        group: ['heroId']
      });
      
      res.status(200).json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 赛季英雄总览：按英雄聚合选用 / 禁用 / 胜率 / 最后一击 / 大招充能。
  // 数据来自 player_hero_stats（v2 外部同步明细），旧赛季无明细时返回空数组，由前端门控隐藏。
  getHeroOverview: async (req, res) => {
    try {
      const seasonIdNum = Number(req.query.seasonId);
      if (!Number.isFinite(seasonIdNum)) {
        return res.status(400).json({ error: 'seasonId 不合法' });
      }

      const [pickRows] = await sequelize.query(`
        SELECT
          phs.heroId AS heroId,
          MAX(phs.heroName) AS heroName,
          COUNT(DISTINCT ps.mapGameId) AS mapsAppeared,
          COUNT(DISTINCT ps.id) AS pickCount,
          SUM(phs.usageSeconds) AS usageSeconds,
          SUM(phs.finalBlows) AS finalBlows,
          SUM(phs.deathsByFinalBlow) AS deathsByFinalBlow,
          SUM(phs.ultReady) AS ultReady,
          SUM(phs.ultUsed) AS ultUsed,
          AVG(phs.avgUltChargeSeconds) AS avgUltChargeSeconds,
          SUM(CASE WHEN mg.winnerId = ps.teamId THEN 1 ELSE 0 END) AS winPicks
        FROM player_hero_stats phs
        JOIN player_stats ps ON ps.id = phs.playerStatId
        JOIN map_games mg ON mg.id = ps.mapGameId
        WHERE mg.seasonId = :seasonId AND phs.heroId IS NOT NULL
        GROUP BY phs.heroId
      `, { replacements: { seasonId: seasonIdNum } });

      const [banRows] = await sequelize.query(`
        SELECT heroId, COUNT(*) AS banCount FROM (
          SELECT team1BanHeroId AS heroId FROM map_games WHERE seasonId = :seasonId AND team1BanHeroId IS NOT NULL
          UNION ALL
          SELECT team2BanHeroId AS heroId FROM map_games WHERE seasonId = :seasonId AND team2BanHeroId IS NOT NULL
        ) bans GROUP BY heroId
      `, { replacements: { seasonId: seasonIdNum } });

      const [totalRows] = await sequelize.query(
        'SELECT COUNT(*) AS total FROM map_games WHERE seasonId = :seasonId',
        { replacements: { seasonId: seasonIdNum } }
      );
      const totalMapGames = Number(totalRows[0] && totalRows[0].total) || 0;

      const heroes = await Hero.findAll({ raw: true });
      // 注意：本文件顶部 Map 被 Sequelize 地图模型遮蔽，这里用普通对象做映射
      const heroById = {};
      heroes.forEach(h => { heroById[Number(h.id)] = h; });
      const banById = {};
      banRows.forEach(b => { banById[Number(b.heroId)] = Number(b.banCount) || 0; });

      const num = v => Number(v) || 0;
      const buildRow = (heroId, heroNameFallback, row, banCount) => {
        const hero = heroById[heroId] || null;
        const pickCount = num(row && row.pickCount);
        const mapsAppeared = num(row && row.mapsAppeared);
        const usageSeconds = num(row && row.usageSeconds);
        const minutes = usageSeconds / 60;
        const finalBlows = num(row && row.finalBlows);
        const avgUlt = row ? row.avgUltChargeSeconds : null;
        return {
          heroId,
          heroName: (hero && hero.name) || heroNameFallback || '未知英雄',
          role: (hero && hero.role) || null,
          subRole: (hero && hero.subRole) || null,
          pickCount,
          mapsAppeared,
          pickRate: totalMapGames ? mapsAppeared / totalMapGames : 0,
          banCount,
          banRate: totalMapGames ? banCount / totalMapGames : 0,
          winRate: pickCount ? num(row && row.winPicks) / pickCount : 0,
          usageSeconds,
          finalBlows,
          finalBlowsPer10: minutes ? finalBlows / minutes * 10 : 0,
          deathsByFinalBlow: num(row && row.deathsByFinalBlow),
          ultReady: num(row && row.ultReady),
          ultUsed: num(row && row.ultUsed),
          avgUltChargeSeconds: avgUlt === null || avgUlt === undefined ? null : Number(avgUlt)
        };
      };

      const data = pickRows.map(row =>
        buildRow(Number(row.heroId), row.heroName, row, banById[Number(row.heroId)] || 0)
      );
      // 只有 ban、没有选用明细的英雄也列出来（选用指标全 0）
      for (const [heroIdKey, banCount] of Object.entries(banById)) {
        const heroId = Number(heroIdKey);
        if (data.some(d => d.heroId === heroId)) continue;
        data.push(buildRow(heroId, null, null, banCount));
      }

      res.json({ data, totalMapGames });
    } catch (error) {
      console.error('获取英雄总览数据失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  },

  // 某英雄在某赛季的使用选手数据：最后一击/10min、最后一击/死亡、按使用时长加权的大招充能秒数。
  // 数据来自 player_hero_stats；无对应指标的字段返回 null，由前端整列隐藏。
  getHeroPlayers: async (req, res) => {
    try {
      const seasonIdNum = Number(req.query.seasonId);
      const heroIdNum = Number(req.query.heroId);
      if (!Number.isFinite(seasonIdNum) || !Number.isFinite(heroIdNum)) {
        return res.status(400).json({ error: 'seasonId / heroId 不合法' });
      }

      const [rows] = await sequelize.query(`
        SELECT
          ps.playerId AS playerId,
          ps.teamId AS teamId,
          ps.mapGameId AS mapGameId,
          phs.usageSeconds AS usageSeconds,
          phs.finalBlows AS finalBlows,
          phs.deathsByFinalBlow AS deathsByFinalBlow,
          phs.avgUltChargeSeconds AS avgUltChargeSeconds
        FROM player_hero_stats phs
        JOIN player_stats ps ON ps.id = phs.playerStatId
        JOIN map_games mg ON mg.id = ps.mapGameId
        WHERE mg.seasonId = :seasonId AND phs.heroId = :heroId
        ORDER BY ps.id ASC
      `, { replacements: { seasonId: seasonIdNum, heroId: heroIdNum } });

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

      const players = await Player.findAll({ raw: true });
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

      res.json({ data });
    } catch (error) {
      console.error('获取英雄选手数据失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  },

  // 选手赛季英雄数据：该选手在该赛季使用过的所有英雄，按英雄聚合使用时长 / 最后一击 / 大招充能
  getPlayerHeroes: async (req, res) => {
    try {
      const seasonIdNum = Number(req.query.seasonId);
      const playerIdNum = Number(req.query.playerId);
      if (!Number.isFinite(seasonIdNum) || !Number.isFinite(playerIdNum)) {
        return res.status(400).json({ error: 'seasonId / playerId 不合法' });
      }

      const [rows] = await sequelize.query(`
        SELECT
          phs.heroId AS heroId,
          ps.mapGameId AS mapGameId,
          phs.usageSeconds AS usageSeconds,
          phs.finalBlows AS finalBlows,
          phs.deathsByFinalBlow AS deathsByFinalBlow,
          phs.avgUltChargeSeconds AS avgUltChargeSeconds
        FROM player_hero_stats phs
        JOIN player_stats ps ON ps.id = phs.playerStatId
        JOIN map_games mg ON mg.id = ps.mapGameId
        WHERE mg.seasonId = :seasonId AND ps.playerId = :playerId
        ORDER BY phs.heroId ASC, ps.id ASC
      `, { replacements: { seasonId: seasonIdNum, playerId: playerIdNum } });

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

      res.json({ data });
    } catch (error) {
      console.error('获取选手英雄数据失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  },

  // 选手对比
  comparePlayers: async (req, res) => {
    try {
      const { playerIds } = req.query;
      if (!playerIds || !Array.isArray(playerIds)) {
        return res.status(400).json({ error: 'Player IDs are required' });
      }
      
      const players = await Player.findAll({ where: { id: { [Op.in]: playerIds } } });
      if (players.length === 0) {
        return res.status(404).json({ error: 'No players found' });
      }
      
      // 获取每个选手的统计数据
      const playerStats = [];
      for (const player of players) {
        const stats = await PlayerStat.findAll({
          where: { playerId: player.id },
          attributes: [
            [Sequelize.fn('AVG', Sequelize.col('kills')), 'avgKills'],
            [Sequelize.fn('AVG', Sequelize.col('deaths')), 'avgDeaths'],
            [Sequelize.fn('AVG', Sequelize.col('assists')), 'avgAssists'],
            [Sequelize.fn('AVG', Sequelize.col('damage')), 'avgDamage'],
            [Sequelize.fn('AVG', Sequelize.col('healing')), 'avgHealing'],
            [Sequelize.fn('AVG', Sequelize.col('mitigation')), 'avgMitigation'],
            [Sequelize.fn('AVG', Sequelize.col('ultsUsed')), 'avgUltsUsed'],
            [Sequelize.fn('AVG', Sequelize.col('finalBlows')), 'avgFinalBlows']
          ]
        });
        
        playerStats.push({
          player,
          stats: stats[0] || {}
        });
      }
      
      res.status(200).json(playerStats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 队伍对比
  compareTeams: async (req, res) => {
    try {
      const { teamIds } = req.query;
      if (!teamIds || !Array.isArray(teamIds)) {
        return res.status(400).json({ error: 'Team IDs are required' });
      }
      
      const teams = await Team.findAll({ where: { id: { [Op.in]: teamIds } } });
      if (teams.length === 0) {
        return res.status(404).json({ error: 'No teams found' });
      }
      
      // 获取每个队伍的统计数据
      const teamStats = [];
      for (const team of teams) {
        const stats = await PlayerStat.findAll({
          where: { teamId: team.id },
          attributes: [
            [Sequelize.fn('AVG', Sequelize.col('kills')), 'avgKills'],
            [Sequelize.fn('AVG', Sequelize.col('deaths')), 'avgDeaths'],
            [Sequelize.fn('AVG', Sequelize.col('assists')), 'avgAssists'],
            [Sequelize.fn('AVG', Sequelize.col('damage')), 'avgDamage'],
            [Sequelize.fn('AVG', Sequelize.col('healing')), 'avgHealing'],
            [Sequelize.fn('AVG', Sequelize.col('mitigation')), 'avgMitigation'],
            [Sequelize.fn('AVG', Sequelize.col('ultsUsed')), 'avgUltsUsed'],
            [Sequelize.fn('AVG', Sequelize.col('finalBlows')), 'avgFinalBlows']
          ]
        });
        
        teamStats.push({
          team,
          stats: stats[0] || {}
        });
      }
      
      res.status(200).json(teamStats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  
  // 获取地图选取统计数据
  getMapPickStats: async (req, res) => {
    try {
      const { seasonId } = req.query;
      
      if (!seasonId) {
        return res.status(400).json({ error: 'Season ID is required' });
      }
      
      // 获取赛季的所有地图局
      const mapGames = await MapGame.findAll({ where: { seasonId } });
      
      // 统计地图选取次数
      const mapPickCounts = {};
      for (const game of mapGames) {
        if (game.mapId) {
          mapPickCounts[game.mapId] = (mapPickCounts[game.mapId] || 0) + 1;
        }
      }
      
      // 关联地图信息
      const Map = require('../models/Map');
      const mapStats = [];
      
      for (const [mapId, pickCount] of Object.entries(mapPickCounts)) {
        const map = await Map.findByPk(parseInt(mapId));
        if (map) {
          mapStats.push({
            mapId: parseInt(mapId),
            mapName: map.name,
            mapType: map.type,
            pickCount
          });
        }
      }
      
      // 按地图类型分组
      const mapStatsByType = {};
      for (const stat of mapStats) {
        if (!mapStatsByType[stat.mapType]) {
          mapStatsByType[stat.mapType] = [];
        }
        mapStatsByType[stat.mapType].push(stat);
      }
      
      // 计算每种类型内各地图的选取率
      const result = [];
      for (const [mapType, stats] of Object.entries(mapStatsByType)) {
        // 计算该类型的总选取次数
        const totalPicks = stats.reduce((sum, stat) => sum + stat.pickCount, 0);
        
        // 计算每个地图的选取率
        const typeStats = stats.map(stat => ({
          mapId: stat.mapId,
          mapName: stat.mapName,
          mapType,
          pickCount: stat.pickCount,
          pickRate: totalPicks > 0 ? (stat.pickCount / totalPicks * 100).toFixed(2) : 0
        }));
        
        // 按选取率降序排序
        typeStats.sort((a, b) => b.pickRate - a.pickRate);
        
        result.push({
          mapType,
          totalPicks,
          maps: typeStats
        });
      }
      
      // 按地图类型排序（机动推进、运载目标、攻击/护送、闪点作战、占领要点）
      const mapTypeOrder = ['机动推进', '运载目标', '攻击/护送', '闪点作战', '占领要点'];
      result.sort((a, b) => mapTypeOrder.indexOf(a.mapType) - mapTypeOrder.indexOf(b.mapType));
      
      res.status(200).json({
        data: result,
        totalGames: mapGames.length
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = StatsController;
