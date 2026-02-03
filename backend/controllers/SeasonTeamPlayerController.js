const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeam = require('../models/SeasonTeam');
const Player = require('../models/Player');

class SeasonTeamPlayerController {
  // 获取所有赛季-队伍-选手关联
  static async getAll(req, res) {
    try {
      const seasonTeamPlayers = await SeasonTeamPlayer.findAll({
        include: [
          { model: SeasonTeam, attributes: ['id'] },
          { model: Player, attributes: ['id', 'name', 'role'] }
        ]
      });
      res.json(seasonTeamPlayers);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // 根据ID获取赛季-队伍-选手关联
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const seasonTeamPlayer = await SeasonTeamPlayer.findByPk(id, {
        include: [
          { model: SeasonTeam, attributes: ['id'] },
          { model: Player, attributes: ['id', 'name', 'role'] }
        ]
      });
      if (!seasonTeamPlayer) {
        return res.status(404).json({ error: '赛季-队伍-选手关联不存在' });
      }
      res.json(seasonTeamPlayer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // 获取指定赛季-队伍的所有选手
  static async getPlayersBySeasonTeamId(req, res) {
    try {
      const { seasonTeamId } = req.params;
      const seasonTeamPlayers = await SeasonTeamPlayer.findAll({
        where: { seasonTeamId },
        include: [
          { model: Player, attributes: ['id', 'name', 'role'] }
        ]
      });
      res.json(seasonTeamPlayers);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // 创建赛季-队伍-选手关联
  static async create(req, res) {
    try {
      const { seasonTeamId, playerId } = req.body;
      
      // 检查是否已存在关联
      const existingSeasonTeamPlayer = await SeasonTeamPlayer.findOne({
        where: { seasonTeamId, playerId }
      });
      
      if (existingSeasonTeamPlayer) {
        return res.status(400).json({ error: '该赛季-队伍-选手关联已存在' });
      }
      
      // 检查赛季-队伍关联是否存在
      const seasonTeam = await SeasonTeam.findByPk(seasonTeamId);
      if (!seasonTeam) {
        return res.status(400).json({ error: '赛季-队伍关联不存在' });
      }
      
      // 检查选手是否存在
      const player = await Player.findByPk(playerId);
      if (!player) {
        return res.status(400).json({ error: '选手不存在' });
      }
      
      const seasonTeamPlayer = await SeasonTeamPlayer.create({ seasonTeamId, playerId });
      res.status(201).json(seasonTeamPlayer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // 批量创建赛季-队伍-选手关联
  static async bulkCreate(req, res) {
    try {
      const { seasonTeamId, playerIds } = req.body;
      
      if (!seasonTeamId || !playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
        return res.status(400).json({ error: '参数错误' });
      }
      
      // 检查赛季-队伍关联是否存在
      const seasonTeam = await SeasonTeam.findByPk(seasonTeamId);
      if (!seasonTeam) {
        return res.status(400).json({ error: '赛季-队伍关联不存在' });
      }
      
      // 检查选手是否存在
      const players = await Player.findAll({
        where: { id: playerIds }
      });
      
      if (players.length !== playerIds.length) {
        return res.status(400).json({ error: '部分选手不存在' });
      }
      
      // 检查已存在的关联
      const existingSeasonTeamPlayers = await SeasonTeamPlayer.findAll({
        where: {
          seasonTeamId,
          playerId: playerIds
        }
      });
      
      const existingPlayerIds = existingSeasonTeamPlayers.map(stp => stp.playerId);
      const newPlayerIds = playerIds.filter(id => !existingPlayerIds.includes(id));
      
      if (newPlayerIds.length === 0) {
        return res.status(400).json({ error: '所选选手已全部关联' });
      }
      
      // 批量创建
      const seasonTeamPlayers = await SeasonTeamPlayer.bulkCreate(
        newPlayerIds.map(playerId => ({ seasonTeamId, playerId }))
      );
      
      res.status(201).json({
        created: seasonTeamPlayers,
        existing: existingPlayerIds,
        message: `成功添加 ${seasonTeamPlayers.length} 个选手关联，${existingPlayerIds.length} 个已存在`
      });
    } catch (error) {
      console.error('批量创建赛季-队伍-选手关联失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // 更新赛季-队伍-选手关联
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { seasonTeamId, playerId } = req.body;
      
      const seasonTeamPlayer = await SeasonTeamPlayer.findByPk(id);
      if (!seasonTeamPlayer) {
        return res.status(404).json({ error: '赛季-队伍-选手关联不存在' });
      }
      
      // 检查是否已存在其他关联
      if (seasonTeamId !== seasonTeamPlayer.seasonTeamId || playerId !== seasonTeamPlayer.playerId) {
        const existingSeasonTeamPlayer = await SeasonTeamPlayer.findOne({
          where: { seasonTeamId, playerId }
        });
        
        if (existingSeasonTeamPlayer) {
          return res.status(400).json({ error: '该赛季-队伍-选手关联已存在' });
        }
      }
      
      // 检查赛季-队伍关联是否存在
      const seasonTeam = await SeasonTeam.findByPk(seasonTeamId);
      if (!seasonTeam) {
        return res.status(400).json({ error: '赛季-队伍关联不存在' });
      }
      
      // 检查选手是否存在
      const player = await Player.findByPk(playerId);
      if (!player) {
        return res.status(400).json({ error: '选手不存在' });
      }
      
      await seasonTeamPlayer.update({ seasonTeamId, playerId });
      res.json(seasonTeamPlayer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // 删除赛季-队伍-选手关联
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const seasonTeamPlayer = await SeasonTeamPlayer.findByPk(id);
      if (!seasonTeamPlayer) {
        return res.status(404).json({ error: '赛季-队伍-选手关联不存在' });
      }
      await seasonTeamPlayer.destroy();
      res.json({ message: '赛季-队伍-选手关联删除成功' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SeasonTeamPlayerController;