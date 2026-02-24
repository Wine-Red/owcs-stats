const SeasonPlayerStat = require('../models/SeasonPlayerStat');
const Player = require('../models/Player');
const Team = require('../models/Team');
const Season = require('../models/Season');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const sequelize = require('../config/database');
const xlsx = require('xlsx');
const fs = require('fs');

const SeasonStatController = {
  // Upload and process season stats file
  uploadSeasonStats: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      if (!req.file) {
        return res.status(400).json({ error: '请上传文件' });
      }

      const { seasonId, dryRun } = req.body;
      const isDryRun = dryRun === 'true';

      if (!seasonId) {
        return res.status(400).json({ error: '缺少赛季ID' });
      }

      const filePath = req.file.path;
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // 读取为二维数组，寻找表头
      const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
      // 寻找包含 'Player' 和 'Team' 的行索引
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(rawData.length, 20); i++) {
          const row = rawData[i];
          if (row && row.includes('Player') && row.includes('Team')) {
              headerRowIndex = i;
              break;
          }
      }

      if (headerRowIndex === -1) {
          if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: '无法识别表头，请确保包含 "Player" 和 "Team" 列' });
      }

      // 重新读取数据，指定 range
      const data = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex });

      if (data.length === 0) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '未读取到数据，请检查Excel文件格式' });
      }

      const normalizeRole = (roleStr) => {
          if (!roleStr) return 'flex';
          const lower = roleStr.toLowerCase();
          if (lower.includes('tank')) return 'tank';
          if (lower.includes('support')) return 'support';
          if (lower.includes('dps') || lower.includes('damage')) return 'damage';
          return 'flex';
      };

      const previewData = [];

      // 预览逻辑
      if (isDryRun) {
        for (const row of data) {
           const playerName = row['Player'];
           const teamName = row['Team'];
           const role = row['Roles'];
           
           if (!playerName || !teamName) {
             previewData.push({
               raw: row,
               status: 'warning',
               message: '缺少选手名或队名'
             });
             continue;
           }
           
           const normalizedRole = normalizeRole(role);
           const team = await Team.findOne({ where: { name: teamName }, transaction: t });
           const player = await Player.findOne({ where: { name: playerName }, transaction: t });

           previewData.push({
             playerName,
             teamName,
             role: normalizedRole,
             rawRole: role,
             teamStatus: team ? 'existing' : 'new',
             playerStatus: player ? 'existing' : 'new',
             status: 'valid'
           });
        }
        
        await t.commit(); // 只读操作，commit也没事
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.json({ preview: previewData, total: data.length });
      }

      // 真实写入逻辑
      
      // Delete existing stats for this season
      await SeasonPlayerStat.destroy({
        where: { seasonId },
        transaction: t
      });

      let insertedCount = 0;

      for (const row of data) {
        // Excel columns: Player, Roles, Team, Elims, Assists, Deaths, DMG, Healing, Mit, Game Time, K/D, KA/D, Elims / Min, Assists / Min, Deaths / Min, DMG / Min, Mit / Min, Heals / Min
        
        const playerName = row['Player'];
        const teamName = row['Team'];
        
        if (!playerName || !teamName) continue;

        const normalizedRole = normalizeRole(row['Roles']);

        // Find or Create Team
        let team = await Team.findOne({ where: { name: teamName }, transaction: t });
        if (!team) {
          team = await Team.create({ 
              name: teamName,
              region: 'ap' // Default region
          }, { transaction: t });
        }

        // Find or Create SeasonTeam
        let seasonTeam = await SeasonTeam.findOne({
            where: { seasonId, teamId: team.id },
            transaction: t
        });
        if (!seasonTeam) {
            seasonTeam = await SeasonTeam.create({
                seasonId,
                teamId: team.id
            }, { transaction: t });
        }

        // Find or Create Player
        // Note: Linking to team might be tricky if player changes teams, but for now we just link to the team in the file
        let player = await Player.findOne({ where: { name: playerName }, transaction: t });
        if (!player) {
          player = await Player.create({ name: playerName, teamId: team.id, role: normalizedRole }, { transaction: t });
        } else {
            // Update player role if needed (optional, but good for consistency)
            if (player.role !== normalizedRole) {
                await player.update({ role: normalizedRole }, { transaction: t });
            }
        }

        // Find or Create SeasonTeamPlayer
        let seasonTeamPlayer = await SeasonTeamPlayer.findOne({
            where: { seasonTeamId: seasonTeam.id, playerId: player.id },
            transaction: t
        });
        if (!seasonTeamPlayer) {
            await SeasonTeamPlayer.create({
                seasonTeamId: seasonTeam.id,
                playerId: player.id
            }, { transaction: t });
        }

        // Create Stat
        await SeasonPlayerStat.create({
          seasonId,
          playerId: player.id,
          teamId: team.id,
          playerName: playerName,
          teamName: teamName,
          role: normalizedRole,
          elims: row['Elims'] || 0,
          assists: row['Assists'] || 0,
          deaths: row['Deaths'] || 0,
          damage: row['DMG'] || 0,
          healing: row['Healing'] || 0,
          mitigation: row['Mit'] || 0,
          gameTime: row['Game Time'] || 0,
          kd: row['K/D'] || 0,
          kad: row['KA/D'] || 0,
          elimsPerMin: row['Elims / Min'] || 0,
          assistsPerMin: row['Assists / Min'] || 0,
          deathsPerMin: row['Deaths / Min'] || 0,
          damagePerMin: row['DMG / Min'] || 0,
          mitigationPerMin: row['Mit / Min'] || 0,
          healingPerMin: row['Heals / Min'] || 0
        }, { transaction: t });
        
        insertedCount++;
      }

      await t.commit();
      
      // Remove uploaded file
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.json({ message: '赛季数据导入成功', count: insertedCount });
    } catch (error) {
      await t.rollback();
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error('导入失败:', error);
      res.status(500).json({ error: '导入失败: ' + error.message });
    }
  },

  // Get aggregated season stats
  getSeasonStats: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const stats = await SeasonPlayerStat.findAll({
        where: { seasonId },
        include: [
          { model: Player, as: 'player' },
          { model: Team, as: 'team' }
        ]
      });
      res.json(stats);
    } catch (error) {
      console.error('获取赛季数据失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  }
};

module.exports = SeasonStatController;
