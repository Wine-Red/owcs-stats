const { Op, Sequelize } = require('sequelize');
const PlayerStat = require('../models/PlayerStat');
const Player = require('../models/Player');
const Team = require('../models/Team');
const MapGame = require('../models/MapGame');

const StatsController = {
  // 获取选手统计数据
  getPlayerStats: async (req, res) => {
    try {
      const { playerId, seasonId, limit = 20 } = req.query;
      
      const where = {};
      if (playerId) where.playerId = playerId;
      if (seasonId) {
        // 获取赛季的所有地图局
        const mapGames = await MapGame.findAll({ where: { seasonId } });
        const mapGameIds = mapGames.map(mg => mg.id);
        where.mapGameId = { [Op.in]: mapGameIds };
      }
      
      const playerStats = await PlayerStat.findAll({ 
        where,
        include: ['player', 'hero', 'team'],
        limit: parseInt(limit)
      });
      
      res.status(200).json(playerStats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取队伍统计数据
  getTeamStats: async (req, res) => {
    try {
      const { seasonId } = req.query;
      
      const where = {};
      if (seasonId) {
        const mapGames = await MapGame.findAll({ where: { seasonId } });
        const mapGameIds = mapGames.map(mg => mg.id);
        where.mapGameId = { [Op.in]: mapGameIds };
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
      
      res.status(200).json(stats);
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
  }
};

module.exports = StatsController;