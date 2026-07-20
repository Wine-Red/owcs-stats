const { Op, Sequelize } = require('sequelize');
const PlayerStat = require('../models/PlayerStat');
const Player = require('../models/Player');
const Team = require('../models/Team');
const MapGame = require('../models/MapGame');
const Match = require('../models/Match');
const Map = require('../models/Map');
const Hero = require('../models/Hero');
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
