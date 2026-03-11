const SeasonPlayerStat = require('../models/SeasonPlayerStat');
const Player = require('../models/Player');
const Team = require('../models/Team');
const Season = require('../models/Season');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const sequelize = require('../config/database');
const xlsx = require('xlsx');
const fs = require('fs');
const AIService = require('../services/AIService');

// Helper function to normalize roles
const normalizeRole = (roleStr) => {
  if (!roleStr) return 'flex';
  const lower = roleStr.toLowerCase();
  if (lower.includes('tank')) return 'tank';
  if (lower.includes('support')) return 'support';
  if (lower.includes('dps') || lower.includes('damage')) return 'damage';
  return 'flex';
};

// Helper function to save stats data
const saveSeasonStatsData = async (seasonId, dataList, t) => {
  let insertedCount = 0;
  
  // Delete existing stats for this season
  await SeasonPlayerStat.destroy({
    where: { seasonId },
    transaction: t
  });

  for (const row of dataList) {
    const { playerName, teamName, role } = row;
    
    if (!playerName || !teamName) continue;

    const normalizedRole = normalizeRole(role);

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
    let player = await Player.findOne({ where: { name: playerName }, transaction: t });
    if (!player) {
      player = await Player.create({ name: playerName, teamId: team.id, role: normalizedRole }, { transaction: t });
    } else {
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
      elims: row.elims || 0,
      assists: row.assists || 0,
      deaths: row.deaths || 0,
      damage: row.damage || 0,
      healing: row.healing || 0,
      mitigation: row.mitigation || 0,
      gameTime: row.gameTime || 0,
      kd: row.kd || 0,
      kad: row.kad || 0,
      elimsPerMin: row.elimsPerMin || 0,
      assistsPerMin: row.assistsPerMin || 0,
      deathsPerMin: row.deathsPerMin || 0,
      damagePerMin: row.damagePerMin || 0,
      mitigationPerMin: row.mitigationPerMin || 0,
      healingPerMin: row.healingPerMin || 0
    }, { transaction: t });
    
    insertedCount++;
  }
  
  return insertedCount;
};

const SeasonStatController = {
  // AI Preview
  previewAIStats: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '请上传文件' });
      }

      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // Convert to JSON (header: 1 means array of arrays)
      const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
      // Simple heuristic to find header row (row with most string columns)
      let headerRowIndex = 0;
      let maxStringCount = 0;
      
      for(let i=0; i<Math.min(rawData.length, 10); i++) {
          const row = rawData[i];
          if(!row || row.length === 0) continue;
          const stringCount = row.filter(cell => typeof cell === 'string').length;
          if(stringCount > maxStringCount) {
              maxStringCount = stringCount;
              headerRowIndex = i;
          }
      }
      
      const headers = rawData[headerRowIndex];
      const sampleData = rawData.slice(headerRowIndex + 1, headerRowIndex + 4); // Next 3 rows
      
      // Call AI Service
      let mapping;
      try {
          mapping = await AIService.getColumnMapping(headers, sampleData);
      } catch (aiError) {
          console.error("AI Service Error:", aiError);
          // Fallback or rethrow? Let's return error for now
          throw aiError;
      }
      
      // Parse data using mapping
      const data = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex });
      const previewData = [];
      
      // Preview all valid rows
      for (const row of data) {
          const playerName = row[mapping.playerName];
          const teamName = row[mapping.teamName];
          
          if (!playerName || !teamName) continue;
          
          const normalizedRole = normalizeRole(row[mapping.role]);
          
          // Check existence (read-only check)
          const team = await Team.findOne({ where: { name: teamName } });
          const player = await Player.findOne({ where: { name: playerName } });

          previewData.push({
             playerName,
             teamName,
             role: normalizedRole,
             rawRole: row[mapping.role],
             teamStatus: team ? 'existing' : 'new',
             playerStatus: player ? 'existing' : 'new',
             status: 'valid',
             // Add some stats for preview
             elims: row[mapping.elims],
             damage: row[mapping.damage]
          });
      }
      
      // Cleanup
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      
      res.json({ preview: previewData, mapping });
      
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      console.error('AI 预览失败:', error);
      res.status(500).json({ error: 'AI 预览失败: ' + error.message });
    }
  },

  // Upload and process season stats file
  uploadSeasonStats: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      if (!req.file) {
        return res.status(400).json({ error: '请上传文件' });
      }

      const { seasonId, dryRun, mapping: mappingJson } = req.body;
      const isDryRun = dryRun === 'true';
      const mapping = mappingJson ? JSON.parse(mappingJson) : null;

      if (!seasonId) {
        return res.status(400).json({ error: '缺少赛季ID' });
      }

      const filePath = req.file.path;
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      let dataList = [];
      let headerRowIndex = -1;

      if (mapping) {
          // AI Mapping Mode
          // We need to find the header row again to be safe, or assume it's the same file structure
          // Let's use the same heuristic as preview
          const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
          let maxStringCount = 0;
          for(let i=0; i<Math.min(rawData.length, 10); i++) {
              const row = rawData[i];
              if(!row || row.length === 0) continue;
              const stringCount = row.filter(cell => typeof cell === 'string').length;
              if(stringCount > maxStringCount) {
                  maxStringCount = stringCount;
                  headerRowIndex = i;
              }
          }
          
          const rawObjects = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex });
          
          dataList = rawObjects.map(row => ({
              playerName: row[mapping.playerName],
              teamName: row[mapping.teamName],
              role: row[mapping.role],
              elims: row[mapping.elims],
              assists: row[mapping.assists],
              deaths: row[mapping.deaths],
              damage: row[mapping.damage],
              healing: row[mapping.healing],
              mitigation: row[mapping.mitigation],
              gameTime: row[mapping.gameTime],
              kd: row[mapping.kd],
              kad: row[mapping.kad],
              elimsPerMin: row[mapping.elimsPerMin],
              assistsPerMin: row[mapping.assistsPerMin],
              deathsPerMin: row[mapping.deathsPerMin],
              damagePerMin: row[mapping.damagePerMin],
              mitigationPerMin: row[mapping.mitigationPerMin],
              healingPerMin: row[mapping.healingPerMin]
          }));

      } else {
          // Legacy Mode
          // 读取为二维数组，寻找表头
          const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
          
          // 寻找包含 'Player' 和 'Team' 的行索引
          for (let i = 0; i < Math.min(rawData.length, 20); i++) {
              const row = rawData[i];
              if (row && row.includes('Player') && row.includes('Team')) {
                  headerRowIndex = i;
                  break;
              }
          }
    
          if (headerRowIndex === -1) {
              if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
              await t.rollback();
              return res.status(400).json({ error: '无法识别表头，请确保包含 "Player" 和 "Team" 列' });
          }
    
          // 重新读取数据，指定 range
          const rawObjects = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex });
          
          dataList = rawObjects.map(row => ({
              playerName: row['Player'],
              teamName: row['Team'],
              role: row['Roles'],
              elims: row['Elims'],
              assists: row['Assists'],
              deaths: row['Deaths'],
              damage: row['DMG'],
              healing: row['Healing'],
              mitigation: row['Mit'],
              gameTime: row['Game Time'],
              kd: row['K/D'],
              kad: row['KA/D'],
              elimsPerMin: row['Elims / Min'],
              assistsPerMin: row['Assists / Min'],
              deathsPerMin: row['Deaths / Min'],
              damagePerMin: row['DMG / Min'],
              mitigationPerMin: row['Mit / Min'],
              healingPerMin: row['Heals / Min']
          }));
      }

      if (dataList.length === 0) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        await t.rollback();
        return res.status(400).json({ error: '未读取到数据，请检查Excel文件格式' });
      }

      // 预览逻辑
      if (isDryRun) {
        const previewData = [];
        for (const row of dataList) {
           const { playerName, teamName, role } = row;
           
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
        return res.json({ preview: previewData, total: dataList.length });
      }

      // 真实写入逻辑
      const insertedCount = await saveSeasonStatsData(seasonId, dataList, t);

      await t.commit();
      
      // Remove uploaded file
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.json({ message: '赛季数据导入成功', count: insertedCount });
    } catch (error) {
      if (t) await t.rollback();
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
