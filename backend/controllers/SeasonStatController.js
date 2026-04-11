const SeasonPlayerStat = require('../models/SeasonPlayerStat');
const Player = require('../models/Player');
const Team = require('../models/Team');
const MapModel = require('../models/Map');
const Season = require('../models/Season');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeamScoreStat = require('../models/SeasonTeamScoreStat');
const SeasonMapPickStat = require('../models/SeasonMapPickStat');
const SeasonStageSnapshot = require('../models/SeasonStageSnapshot');
const SeasonStageSnapshotTeamScoreStat = require('../models/SeasonStageSnapshotTeamScoreStat');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const xlsx = require('xlsx');
const fs = require('fs');
const AIService = require('../services/AIService');

// Helper function to normalize roles
const normalizeRole = (roleStr) => {
  if (!roleStr) return null;
  const lower = roleStr.toLowerCase();
  if (lower.includes('tank')) return 'tank';
  if (lower.includes('support')) return 'support';
  if (lower.includes('dps') || lower.includes('damage')) return 'damage';
  return null;
};

const parseOptionalInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
};

const calcNonNegativeDiff = (toVal, fromVal) => {
  const a = Number(toVal ?? 0) || 0;
  const b = Number(fromVal ?? 0) || 0;
  const diff = a - b;
  return diff < 0 ? 0 : diff;
};

// Helper function to save stats data
const saveSeasonStatsData = async (seasonId, dataList, t) => {
  let insertedCount = 0;
  
  // Delete existing stats for this season
  await SeasonPlayerStat.destroy({
    where: { seasonId },
    transaction: t
  });

  const activeSeasonTeamPlayerIds = [];

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

    // Find or Create Player (with Role match to allow same name but different role)
    let player = null;
    const existingPlayers = await Player.findAll({ where: { name: playerName }, transaction: t });
    
    if (existingPlayers.length > 0) {
      // Try to find exact role match first
      player = existingPlayers.find(p => p.role === normalizedRole);
      
      // If no exact match but we have players, and the incoming role is invalid,
      // fallback to the first existing player to avoid breaking things.
      if (!player && !normalizedRole) {
        player = existingPlayers[0];
      }
    }

    if (!player && !normalizedRole) {
        console.warn(`Skipping new player creation for ${playerName} due to invalid role: ${role}`);
        continue;
    }

    if (!player) {
      player = await Player.create({ name: playerName, teamId: team.id, role: normalizedRole }, { transaction: t });
    } else {
        const updateData = {};
        // We only update teamId now, role is locked to the entity
        if (player.teamId !== team.id) {
            updateData.teamId = team.id;
        }
        if (Object.keys(updateData).length > 0) {
            await player.update(updateData, { transaction: t });
        }
    }

    // Find or Create SeasonTeamPlayer
    let seasonTeamPlayer = await SeasonTeamPlayer.findOne({
        where: { seasonTeamId: seasonTeam.id, playerId: player.id },
        transaction: t
    });
    if (!seasonTeamPlayer) {
        seasonTeamPlayer = await SeasonTeamPlayer.create({
            seasonTeamId: seasonTeam.id,
            playerId: player.id
        }, { transaction: t });
    }
    activeSeasonTeamPlayerIds.push(seasonTeamPlayer.id);

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
  
  // 删除不再出现在当前赛季中的 SeasonTeamPlayer 关联
  if (activeSeasonTeamPlayerIds.length > 0) {
    // 找出所有属于当前赛季的 seasonTeamId
    const seasonTeams = await SeasonTeam.findAll({
      where: { seasonId },
      attributes: ['id'],
      transaction: t
    });
    const seasonTeamIds = seasonTeams.map(st => st.id);

    if (seasonTeamIds.length > 0) {
      await SeasonTeamPlayer.destroy({
        where: {
          seasonTeamId: { [Op.in]: seasonTeamIds },
          id: { [Op.notIn]: activeSeasonTeamPlayerIds }
        },
        transaction: t
      });
    }
  } else {
    // 如果该赛季没有任何活跃选手，则清空该赛季所有的 SeasonTeamPlayer
    const seasonTeams = await SeasonTeam.findAll({
      where: { seasonId },
      attributes: ['id'],
      transaction: t
    });
    const seasonTeamIds = seasonTeams.map(st => st.id);
    if (seasonTeamIds.length > 0) {
      await SeasonTeamPlayer.destroy({
        where: { seasonTeamId: { [Op.in]: seasonTeamIds } },
        transaction: t
      });
    }
  }

  return insertedCount;
};

const getSheetByNameOrIndex = (workbook, preferredName, fallbackIndex) => {
  if (preferredName && workbook.Sheets[preferredName]) {
    return { sheet: workbook.Sheets[preferredName], sheetName: preferredName, source: 'name' };
  }
  const nameByIndex = workbook.SheetNames[fallbackIndex];
  if (nameByIndex && workbook.Sheets[nameByIndex]) {
    return { sheet: workbook.Sheets[nameByIndex], sheetName: nameByIndex, source: 'index' };
  }
  return { sheet: null, sheetName: null, source: 'missing' };
};

const findHeaderRowIndex = (rawData, requiredHeaders, maxScanRows = 30) => {
  const required = (requiredHeaders || []).filter(Boolean);
  if (required.length === 0) return -1;
  for (let i = 0; i < Math.min(rawData.length, maxScanRows); i++) {
    const row = rawData[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    const cellStrings = row.map(v => String(v ?? '').trim()).filter(Boolean);
    const ok = required.every(h => cellStrings.includes(h));
    if (ok) return i;
  }
  return -1;
};

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const aliasMapName = (name) => {
  const dict = {
    '直布罗陀': '监测站：直布罗陀',
    '帕拉伊苏': '帕拉伊索',
    '卢纳萨皮': '鲁纳塞彼'
  };
  return dict[name] || name;
};

const mapNameCandidates = (name) => {
  const n = aliasMapName(name);
  const set = new Set([n, n.replace(/:/g, '：'), n.replace(/：/g, ':')]);
  if (!/^监测站[:：]/.test(n) && (n.includes('直布罗陀') || n.toLowerCase().includes('gibraltar'))) {
    set.add('监测站：直布罗陀');
    set.add('监测站:Gibraltar');
  }
  return Array.from(set);
};

const parseTeamScoreSheet = (workbook) => {
  const { sheet, sheetName, source } = getSheetByNameOrIndex(workbook, '战队比分统计', 1);
  if (!sheet) {
    return {
      items: [],
      summary: { found: false, sheetName: null, source, validCount: 0, warningCount: 1, warnings: ['未找到“战队比分统计”sheet'] }
    };
  }

  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  const requiredHeaders = ['战队名称', '大比分胜', '大比分负', '小比分胜', '小比分负'];
  const headerRowIndex = findHeaderRowIndex(rawData, requiredHeaders);
  if (headerRowIndex === -1) {
    return {
      items: [],
      summary: { found: true, sheetName, source, validCount: 0, warningCount: 1, warnings: ['战队比分统计：无法识别表头'] }
    };
  }

  const objects = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex });
  const items = [];
  let warningCount = 0;
  const warnings = [];

  for (const row of objects) {
    const teamName = String(row['战队名称'] ?? '').trim();
    const teamShortName = String(row['战队简称'] ?? '').trim();
    if (!teamName) {
      warningCount++;
      if (warnings.length < 10) warnings.push('战队比分统计：存在空战队名称行');
      continue;
    }
    items.push({
      teamName,
      teamShortName: teamShortName || null,
      matchWin: toInt(row['大比分胜']),
      matchLoss: toInt(row['大比分负']),
      matchDiff: toInt(row['净胜大比分']),
      mapWin: toInt(row['小比分胜']),
      mapLoss: toInt(row['小比分负']),
      mapDiff: toInt(row['净胜小比分'])
    });
  }

  return {
    items,
    summary: { found: true, sheetName, source, validCount: items.length, warningCount, warnings }
  };
};

const parseMapPickSheet = (workbook) => {
  const { sheet, sheetName, source } = getSheetByNameOrIndex(workbook, '地图选取次数', 2);
  if (!sheet) {
    return {
      items: [],
      summary: { found: false, sheetName: null, source, validCount: 0, warningCount: 1, warnings: ['未找到“地图选取次数”sheet'] }
    };
  }

  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  const requiredHeaders = ['地图名称', '选取次数'];
  const headerRowIndex = findHeaderRowIndex(rawData, requiredHeaders);
  if (headerRowIndex === -1) {
    return {
      items: [],
      summary: { found: true, sheetName, source, validCount: 0, warningCount: 1, warnings: ['地图选取次数：无法识别表头'] }
    };
  }

  const objects = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex });
  const items = [];
  let warningCount = 0;
  const warnings = [];

  for (const row of objects) {
    const mapName = String(row['地图名称'] ?? '').trim();
    if (!mapName) {
      warningCount++;
      if (warnings.length < 10) warnings.push('地图选取次数：存在空地图名称行');
      continue;
    }
    items.push({
      mapName,
      pickCount: toInt(row['选取次数'])
    });
  }

  return {
    items,
    summary: { found: true, sheetName, source, validCount: items.length, warningCount, warnings }
  };
};

const saveSeasonTeamScoreStats = async (seasonId, items, t) => {
  await SeasonTeamScoreStat.destroy({ where: { seasonId }, transaction: t });
  let insertedCount = 0;

  for (const item of items) {
    let team = await Team.findOne({ where: { name: item.teamName }, transaction: t });
    if (!team) {
      team = await Team.create({ name: item.teamName, region: 'ap' }, { transaction: t });
    }

    await SeasonTeam.findOrCreate({
      where: { seasonId, teamId: team.id },
      defaults: { seasonId, teamId: team.id },
      transaction: t
    });

    await SeasonTeamScoreStat.create({
      seasonId,
      teamId: team.id,
      teamName: item.teamName,
      teamShortName: item.teamShortName,
      matchWin: item.matchWin,
      matchLoss: item.matchLoss,
      matchDiff: item.matchDiff,
      mapWin: item.mapWin,
      mapLoss: item.mapLoss,
      mapDiff: item.mapDiff
    }, { transaction: t });

    insertedCount++;
  }

  return insertedCount;
};

const saveSeasonMapPickStats = async (seasonId, items, t) => {
  await SeasonMapPickStat.destroy({ where: { seasonId }, transaction: t });
  let insertedCount = 0;
  let skippedCount = 0;
  const skipped = [];

  for (const item of items) {
    const candidates = mapNameCandidates(item.mapName);
    const map = await MapModel.findOne({ where: { name: { [Op.in]: candidates } }, transaction: t });
    if (!map) {
      skippedCount++;
      if (skipped.length < 10) skipped.push(item.mapName);
      continue;
    }

    await SeasonMapPickStat.create({
      seasonId,
      mapId: map.id,
      mapName: map.name,
      mapType: map.type,
      pickCount: item.pickCount
    }, { transaction: t });
    insertedCount++;
  }

  return { insertedCount, skippedCount, skipped };
};

// Ensure SeasonTeam reflects current import (remove stale teams for the season)
const cleanupSeasonTeams = async (seasonId, t) => {
  // Collect teamIds that appear in player stats and team score stats
  const playerTeamRows = await SeasonPlayerStat.findAll({
    where: { seasonId },
    attributes: ['teamId'],
    transaction: t
  });
  const scoreTeamRows = await SeasonTeamScoreStat.findAll({
    where: { seasonId },
    attributes: ['teamId'],
    transaction: t
  });
  const validTeamIdSet = new Set();
  playerTeamRows.forEach(r => Number.isFinite(Number(r.teamId)) && validTeamIdSet.add(Number(r.teamId)));
  scoreTeamRows.forEach(r => Number.isFinite(Number(r.teamId)) && validTeamIdSet.add(Number(r.teamId)));
  const validTeamIds = Array.from(validTeamIdSet);

  // Find SeasonTeam rows to delete
  const whereSeasonTeams = { seasonId };
  const allSeasonTeams = await SeasonTeam.findAll({ where: whereSeasonTeams, transaction: t });
  const toDeleteSeasonTeamIds = allSeasonTeams
    .filter(st => validTeamIds.length === 0 || !validTeamIdSet.has(Number(st.teamId)))
    .map(st => st.id);

  if (toDeleteSeasonTeamIds.length > 0) {
    await SeasonTeamPlayer.destroy({
      where: { seasonTeamId: { [Op.in]: toDeleteSeasonTeamIds } },
      transaction: t
    });
    await SeasonTeam.destroy({
      where: { id: { [Op.in]: toDeleteSeasonTeamIds } },
      transaction: t
    });
  }
};

const autoImportFromAPI = async (matchesData, seasonId, t) => {
  const playerStatsMap = {};
  const teamScoreMap = {};
  const mapPickMap = {};

  for (const match of matchesData) {
    const teamA = match.teamA?.name;
    const teamB = match.teamB?.name;
    if (!teamA || !teamB) continue;

    if (!teamScoreMap[teamA]) teamScoreMap[teamA] = { teamName: teamA, teamShortName: match.teamA?.short, matchWin: 0, matchLoss: 0, matchDiff: 0, mapWin: 0, mapLoss: 0, mapDiff: 0 };
    if (!teamScoreMap[teamB]) teamScoreMap[teamB] = { teamName: teamB, teamShortName: match.teamB?.short, matchWin: 0, matchLoss: 0, matchDiff: 0, mapWin: 0, mapLoss: 0, mapDiff: 0 };

    const scoreA = parseInt(match.scoreA) || 0;
    const scoreB = parseInt(match.scoreB) || 0;
    
    if (scoreA > scoreB) {
      teamScoreMap[teamA].matchWin += 1;
      teamScoreMap[teamB].matchLoss += 1;
    } else if (scoreB > scoreA) {
      teamScoreMap[teamB].matchWin += 1;
      teamScoreMap[teamA].matchLoss += 1;
    }

    teamScoreMap[teamA].mapWin += scoreA;
    teamScoreMap[teamA].mapLoss += scoreB;
    teamScoreMap[teamB].mapWin += scoreB;
    teamScoreMap[teamB].mapLoss += scoreA;

    for (const round of (match.rounds || [])) {
      const mapName = round.mapName;
      if (mapName) {
        if (!mapPickMap[mapName]) mapPickMap[mapName] = { mapName, pickCount: 0 };
        mapPickMap[mapName].pickCount += 1;
      }

      let durationMin = 0;
      if (round.duration) {
        const parts = round.duration.split(':');
        if (parts.length === 2) {
          durationMin = (parseInt(parts[0], 10) || 0) + (parseInt(parts[1], 10) || 0) / 60;
        }
      }

      const processPlayer = (p, teamName) => {
        if (!p.name) return;
        const pName = p.name;
        const pRole = p.role === 'T' ? 'Tank' : p.role === 'D' ? 'Damage' : p.role === 'S' ? 'Support' : p.role;
        // Make the key unique per player + role combination
        const playerKey = `${pName}_${pRole}`;
        
        if (!playerStatsMap[playerKey]) {
          playerStatsMap[playerKey] = {
            playerName: pName,
            teamName: teamName,
            role: pRole,
            elims: 0, assists: 0, deaths: 0,
            damage: 0, healing: 0, mitigation: 0,
            gameTime: 0
          };
        }
        const stat = playerStatsMap[playerKey];
        stat.teamName = teamName; // Update to latest team
        
        const kadParts = (p.kad || '').split('/');
        stat.elims += parseInt(kadParts[0], 10) || 0;
        stat.assists += parseInt(kadParts[1], 10) || 0;
        stat.deaths += parseInt(kadParts[2], 10) || 0;
        
        stat.damage += parseInt(p.damage, 10) || 0;
        stat.healing += parseInt(p.healing, 10) || 0;
        stat.mitigation += parseInt(p.blocked, 10) || 0;
        stat.gameTime += durationMin;
      };

      (round.playersA || []).forEach(p => processPlayer(p, teamA));
      (round.playersB || []).forEach(p => processPlayer(p, teamB));
    }
  }

  Object.values(teamScoreMap).forEach(tStat => {
    tStat.matchDiff = tStat.matchWin - tStat.matchLoss;
    tStat.mapDiff = tStat.mapWin - tStat.mapLoss;
  });

  const dataList = Object.values(playerStatsMap).map(stat => {
    const gt = stat.gameTime;
    stat.kd = stat.deaths > 0 ? (stat.elims / stat.deaths) : stat.elims;
    stat.kad = stat.deaths > 0 ? ((stat.elims + stat.assists) / stat.deaths) : (stat.elims + stat.assists);
    
    if (gt > 0) {
      stat.elimsPerMin = stat.elims / gt;
      stat.assistsPerMin = stat.assists / gt;
      stat.deathsPerMin = stat.deaths / gt;
      stat.damagePerMin = stat.damage / gt;
      stat.healingPerMin = stat.healing / gt;
      stat.mitigationPerMin = stat.mitigation / gt;
    } else {
      stat.elimsPerMin = 0;
      stat.assistsPerMin = 0;
      stat.deathsPerMin = 0;
      stat.damagePerMin = 0;
      stat.healingPerMin = 0;
      stat.mitigationPerMin = 0;
    }
    return stat;
  });

  const teamScoreItems = Object.values(teamScoreMap);
  const mapPickItems = Object.values(mapPickMap);

  const insertedCount = await saveSeasonStatsData(seasonId, dataList, t);
  const teamScoreCount = await saveSeasonTeamScoreStats(seasonId, teamScoreItems, t);
  const mapPickResult = await saveSeasonMapPickStats(seasonId, mapPickItems, t);
  await cleanupSeasonTeams(seasonId, t);

  return { insertedCount, teamScoreCount, mapPickCount: mapPickResult.insertedCount };
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

      const teamScoreParsed = parseTeamScoreSheet(workbook);
      const mapPickParsed = parseMapPickSheet(workbook);

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
        return res.json({
          preview: previewData,
          total: dataList.length,
          teamScorePreviewSummary: teamScoreParsed.summary,
          mapPickPreviewSummary: mapPickParsed.summary
        });
      }

      // 真实写入逻辑
      const insertedCount = await saveSeasonStatsData(seasonId, dataList, t);
      const teamScoreCount = await saveSeasonTeamScoreStats(seasonId, teamScoreParsed.items, t);
      const { insertedCount: mapPickCount, skippedCount: mapPickSkippedCount, skipped: mapPickSkipped } = await saveSeasonMapPickStats(seasonId, mapPickParsed.items, t);
      // Cleanup stale SeasonTeam entries (teams removed in this import)
      await cleanupSeasonTeams(seasonId, t);

      await t.commit();
      
      // Remove uploaded file
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.json({
        message: '赛季数据导入成功',
        count: insertedCount,
        teamScoreCount,
        mapPickCount,
        mapPickSkippedCount,
        mapPickSkipped
      });
    } catch (error) {
      if (t) await t.rollback();
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error('导入失败:', error);
      res.status(500).json({ error: '导入失败: ' + error.message });
    }
  },

  listStageSnapshots: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const seasonIdNum = Number(seasonId);
      if (!Number.isFinite(seasonIdNum)) {
        return res.status(400).json({ error: 'seasonId 不合法' });
      }

      const snapshots = await SeasonStageSnapshot.findAll({
        where: { seasonId: seasonIdNum },
        order: [['createdAt', 'ASC']]
      });
      return res.json(snapshots);
    } catch (error) {
      console.error('获取阶段快照列表失败:', error);
      return res.status(500).json({ error: '获取数据失败' });
    }
  },

  createStageSnapshot: async (req, res) => {
    let t;
    try {
      const { seasonId } = req.params;
      const seasonIdNum = Number(seasonId);
      if (!Number.isFinite(seasonIdNum)) {
        return res.status(400).json({ error: 'seasonId 不合法' });
      }

      const name = String(req.body?.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'name 不能为空' });
      }

      const season = await Season.findByPk(seasonIdNum);
      if (!season) {
        return res.status(404).json({ error: '赛季不存在' });
      }

      const currentStats = await SeasonTeamScoreStat.findAll({
        where: { seasonId: seasonIdNum }
      });

      t = await sequelize.transaction();

      const snapshot = await SeasonStageSnapshot.create({
        seasonId: seasonIdNum,
        name
      }, { transaction: t });

      if (currentStats.length > 0) {
        const rows = currentStats.map(s => ({
          snapshotId: snapshot.id,
          teamId: s.teamId,
          teamName: s.teamName,
          teamShortName: s.teamShortName ?? null,
          matchWin: s.matchWin ?? 0,
          matchLoss: s.matchLoss ?? 0,
          matchDiff: s.matchDiff ?? 0,
          mapWin: s.mapWin ?? 0,
          mapLoss: s.mapLoss ?? 0,
          mapDiff: s.mapDiff ?? 0
        }));
        await SeasonStageSnapshotTeamScoreStat.bulkCreate(rows, { transaction: t });
      }

      await t.commit();
      return res.json(snapshot);
    } catch (error) {
      if (t) await t.rollback();
      console.error('创建阶段快照失败:', error);
      return res.status(500).json({ error: '创建快照失败' });
    }
  },

  deleteStageSnapshot: async (req, res) => {
    let t;
    try {
      const snapshotId = Number(req.params.snapshotId);
      if (!Number.isFinite(snapshotId)) {
        return res.status(400).json({ error: 'snapshotId 不合法' });
      }

      const snapshot = await SeasonStageSnapshot.findByPk(snapshotId);
      if (!snapshot) {
        return res.status(404).json({ error: '快照不存在' });
      }

      t = await sequelize.transaction();
      await SeasonStageSnapshotTeamScoreStat.destroy({
        where: { snapshotId },
        transaction: t
      });
      await SeasonStageSnapshot.destroy({
        where: { id: snapshotId },
        transaction: t
      });
      await t.commit();
      return res.json({ message: '删除成功' });
    } catch (error) {
      if (t) await t.rollback();
      console.error('删除阶段快照失败:', error);
      return res.status(500).json({ error: '删除失败' });
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
  },

  getSeasonTeamScoreStats: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const fromSnapshotId = parseOptionalInt(req.query.fromSnapshotId);
      const toSnapshotId = parseOptionalInt(req.query.toSnapshotId);

      if (!fromSnapshotId && !toSnapshotId) {
        const stats = await SeasonTeamScoreStat.findAll({
          where: { seasonId },
          include: [{ model: Team, as: 'team' }]
        });
        return res.json(stats);
      }

      const seasonIdNum = Number(seasonId);
      if (!Number.isFinite(seasonIdNum)) {
        return res.status(400).json({ error: 'seasonId 不合法' });
      }

      let toStats = [];
      if (toSnapshotId) {
        const snapshot = await SeasonStageSnapshot.findByPk(toSnapshotId);
        if (!snapshot || Number(snapshot.seasonId) !== seasonIdNum) {
          return res.status(400).json({ error: 'toSnapshotId 不属于该赛季' });
        }
        toStats = await SeasonStageSnapshotTeamScoreStat.findAll({
          where: { snapshotId: toSnapshotId }
        });
      } else {
        toStats = await SeasonTeamScoreStat.findAll({
          where: { seasonId }
        });
      }

      const fromMap = new Map();
      const fromNameMap = new Map();
      if (fromSnapshotId) {
        const snapshot = await SeasonStageSnapshot.findByPk(fromSnapshotId);
        if (!snapshot || Number(snapshot.seasonId) !== seasonIdNum) {
          return res.status(400).json({ error: 'fromSnapshotId 不属于该赛季' });
        }
        const fromStats = await SeasonStageSnapshotTeamScoreStat.findAll({
          where: { snapshotId: fromSnapshotId }
        });
        fromStats.forEach(s => {
          fromMap.set(Number(s.teamId), s);
          const key = String(s.teamName || '').trim().toLowerCase();
          if (key) fromNameMap.set(key, s);
        });
      }

      const teamIds = [];
      const diffStats = toStats.map(s => {
        const teamId = Number(s.teamId);
        if (Number.isFinite(teamId)) teamIds.push(teamId);
        const prev = fromMap.get(teamId) || fromNameMap.get(String(s.teamName || '').trim().toLowerCase());
        const matchWin = calcNonNegativeDiff(s.matchWin, prev?.matchWin);
        const matchLoss = calcNonNegativeDiff(s.matchLoss, prev?.matchLoss);
        const mapWin = calcNonNegativeDiff(s.mapWin, prev?.mapWin);
        const mapLoss = calcNonNegativeDiff(s.mapLoss, prev?.mapLoss);
        return {
          teamId,
          teamName: s.teamName,
          teamShortName: s.teamShortName ?? null,
          matchWin,
          matchLoss,
          matchDiff: matchWin - matchLoss,
          mapWin,
          mapLoss,
          mapDiff: mapWin - mapLoss
        };
      });

      const teams = await Team.findAll({
        where: { id: { [Op.in]: teamIds } }
      });
      const teamMap = new Map(teams.map(t => [Number(t.id), t]));

      diffStats.forEach(s => {
        s.team = teamMap.get(Number(s.teamId)) || null;
      });

      return res.json(diffStats);
    } catch (error) {
      console.error('获取赛季战队比分统计失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  },

  getSeasonMapPickStats: async (req, res) => {
    try {
      const { seasonId } = req.params;
      const stats = await SeasonMapPickStat.findAll({
        where: { seasonId },
        include: [{ model: MapModel, as: 'map' }]
      });
      res.json(stats);
    } catch (error) {
      console.error('获取赛季地图选取统计失败:', error);
      res.status(500).json({ error: '获取数据失败' });
    }
  },

  autoImportFromAPI
};

module.exports = SeasonStatController;
