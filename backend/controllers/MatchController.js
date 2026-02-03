const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const Team = require('../models/Team');
const Season = require('../models/Season');

const MatchController = {
  // 获取所有比赛
  getAll: async (req, res) => {
    try {
      const matches = await Match.findAll({
        include: [
          { model: Season },
          { model: Team, as: 'team1' },
          { model: Team, as: 'team2' },
          { model: Team, as: 'winner' }
        ]
      });
      res.status(200).json(matches);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取单个比赛
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const match = await Match.findByPk(id, {
        include: [
          { model: Season },
          { model: Team, as: 'team1' },
          { model: Team, as: 'team2' },
          { model: Team, as: 'winner' }
        ]
      });
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }
      res.status(200).json(match);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建比赛
  create: async (req, res) => {
    try {
      // 提取地图局数据
      const { mapGames, ...matchData } = req.body;
      
      // 创建比赛
      const match = await Match.create(matchData);
      
      // 如果有地图局数据，创建地图局和选手统计数据
      if (mapGames && mapGames.length > 0) {
        for (const mapGameData of mapGames) {
          // 提取选手统计数据
          const { playerStats, ...mapGameInfo } = mapGameData;
          
          // 设置地图局的比赛ID
          mapGameInfo.matchId = match.id;
          
          // 创建地图局
          const mapGame = await MapGame.create(mapGameInfo);
          
          // 如果有选手统计数据，创建选手统计数据
          if (playerStats && playerStats.length > 0) {
            for (const playerStatData of playerStats) {
              // 设置选手统计数据的地图局ID
              playerStatData.mapGameId = mapGame.id;
              
              // 创建选手统计数据
              await PlayerStat.create(playerStatData);
            }
          }
        }
      }
      
      // 重新获取比赛数据，包含关联数据
      const createdMatch = await Match.findByPk(match.id, {
        include: [
          { model: Season },
          { model: Team, as: 'team1' },
          { model: Team, as: 'team2' },
          { model: Team, as: 'winner' }
        ]
      });
      
      res.status(201).json(createdMatch);
    } catch (error) {
      console.error('创建比赛失败:', error);
      res.status(400).json({ error: error.message });
    }
  },

  // 更新比赛
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const match = await Match.findByPk(id);
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }
      await match.update(req.body);
      res.status(200).json(match);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 删除比赛
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const match = await Match.findByPk(id);
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }
      // 删除关联的地图局
      await MapGame.destroy({ where: { matchId: id } });
      // 删除比赛
      await match.destroy();
      res.status(200).json({ message: 'Match deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取比赛的地图局
  getMapGames: async (req, res) => {
    try {
      const { id } = req.params;
      const match = await Match.findByPk(id);
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }
      const mapGames = await MapGame.findAll({ 
        where: { matchId: id },
        include: ['winner', 'map']
      });
      res.status(200).json(mapGames);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = MatchController;