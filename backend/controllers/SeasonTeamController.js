const SeasonTeam = require('../models/SeasonTeam');
const Season = require('../models/Season');
const Team = require('../models/Team');

class SeasonTeamController {
  // 获取所有赛季-队伍关联
  static async getAll(req, res) {
    try {
      const seasonTeams = await SeasonTeam.findAll({
        include: [
          { model: Season, attributes: ['id', 'name'], as: 'Season' },
          { model: Team, attributes: ['id', 'name'], as: 'Team' }
        ]
      });
      res.json(seasonTeams);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // 根据ID获取赛季-队伍关联
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const seasonTeam = await SeasonTeam.findByPk(id, {
        include: [
          { model: Season, attributes: ['id', 'name'], as: 'Season' },
          { model: Team, attributes: ['id', 'name'], as: 'Team' }
        ]
      });
      if (!seasonTeam) {
        return res.status(404).json({ error: '赛季-队伍关联不存在' });
      }
      res.json(seasonTeam);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // 获取指定赛季的所有队伍
  static async getTeamsBySeasonId(req, res) {
    try {
      const { seasonId } = req.params;
      const season = await Season.findByPk(seasonId, {
        include: [
          {
            model: Team,
            through: { attributes: [] },
            attributes: ['id', 'name', 'region', 'logo']
          }
        ]
      });
      if (!season) {
        return res.status(404).json({ error: '赛季不存在' });
      }
      res.json(season.Teams);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // 创建赛季-队伍关联
  static async create(req, res) {
    try {
      const { seasonId, teamId } = req.body;
      
      // 检查是否已存在关联
      const existingSeasonTeam = await SeasonTeam.findOne({
        where: { seasonId, teamId }
      });
      
      if (existingSeasonTeam) {
        return res.status(400).json({ error: '该赛季-队伍关联已存在' });
      }
      
      // 检查赛季是否存在
      const season = await Season.findByPk(seasonId);
      if (!season) {
        return res.status(400).json({ error: '赛季不存在' });
      }
      
      // 检查队伍是否存在
      const team = await Team.findByPk(teamId);
      if (!team) {
        return res.status(400).json({ error: '队伍不存在' });
      }
      
      const seasonTeam = await SeasonTeam.create({ seasonId, teamId });
      res.status(201).json(seasonTeam);
    } catch (error) {
      console.error('创建赛季-队伍关联失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // 批量创建赛季-队伍关联
  static async bulkCreate(req, res) {
    try {
      const { seasonId, teamIds } = req.body;
      
      if (!seasonId || !teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
        return res.status(400).json({ error: '参数错误' });
      }
      
      // 检查赛季是否存在
      const season = await Season.findByPk(seasonId);
      if (!season) {
        return res.status(400).json({ error: '赛季不存在' });
      }
      
      // 检查队伍是否存在
      const teams = await Team.findAll({
        where: { id: teamIds }
      });
      
      if (teams.length !== teamIds.length) {
        return res.status(400).json({ error: '部分队伍不存在' });
      }
      
      // 检查已存在的关联
      const existingSeasonTeams = await SeasonTeam.findAll({
        where: {
          seasonId,
          teamId: teamIds
        }
      });
      
      const existingTeamIds = existingSeasonTeams.map(st => st.teamId);
      const newTeamIds = teamIds.filter(id => !existingTeamIds.includes(id));
      
      if (newTeamIds.length === 0) {
        return res.status(400).json({ error: '所选队伍已全部关联' });
      }
      
      // 批量创建
      const seasonTeams = await SeasonTeam.bulkCreate(
        newTeamIds.map(teamId => ({ seasonId, teamId }))
      );
      
      res.status(201).json({
        created: seasonTeams,
        existing: existingTeamIds,
        message: `成功添加 ${seasonTeams.length} 个队伍关联，${existingTeamIds.length} 个已存在`
      });
    } catch (error) {
      console.error('批量创建赛季-队伍关联失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // 更新赛季-队伍关联
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { seasonId, teamId } = req.body;
      
      const seasonTeam = await SeasonTeam.findByPk(id);
      if (!seasonTeam) {
        return res.status(404).json({ error: '赛季-队伍关联不存在' });
      }
      
      // 检查是否已存在其他关联
      if (seasonId !== seasonTeam.seasonId || teamId !== seasonTeam.teamId) {
        const existingSeasonTeam = await SeasonTeam.findOne({
          where: { seasonId, teamId }
        });
        
        if (existingSeasonTeam) {
          return res.status(400).json({ error: '该赛季-队伍关联已存在' });
        }
      }
      
      // 检查赛季是否存在
      const season = await Season.findByPk(seasonId);
      if (!season) {
        return res.status(400).json({ error: '赛季不存在' });
      }
      
      // 检查队伍是否存在
      const team = await Team.findByPk(teamId);
      if (!team) {
        return res.status(400).json({ error: '队伍不存在' });
      }
      
      await seasonTeam.update({ seasonId, teamId });
      res.json(seasonTeam);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // 删除赛季-队伍关联
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const seasonTeam = await SeasonTeam.findByPk(id);
      if (!seasonTeam) {
        return res.status(404).json({ error: '赛季-队伍关联不存在' });
      }
      await seasonTeam.destroy();
      res.json({ message: '赛季-队伍关联删除成功' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SeasonTeamController;