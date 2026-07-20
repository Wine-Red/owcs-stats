const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const PlayerHeroStat = require('../models/PlayerHeroStat');
const Team = require('../models/Team');
const Map = require('../models/Map');
const Player = require('../models/Player');
const Hero = require('../models/Hero');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeam = require('../models/SeasonTeam');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

// Helper function to resolve import data
const resolveImportData = async (seasonId, mapData, playerStats) => {
    // 1. 处理地图信息
    // mapData.mapName 格式如 "66号公路（WBG胜利）"
    let mapName = mapData.mapName;
    let winnerName = null;
    
    // 提取地图名和获胜者
    const match = mapName.match(/(.+)[（(](.+?)(?:胜利|胜)[）)]/);
    if (match) {
      mapName = match[1].trim();
      winnerName = match[2].trim();
    }
    
    // 查找地图ID
    const map = await Map.findOne({ where: { name: mapName } });
    if (!map) {
      throw new Error(`找不到地图: ${mapName}`);
    }
    
    // 2. 查找获胜队伍ID (初步)
    let winnerId = null;
    let winnerTeam = null;
    if (winnerName) {
      winnerTeam = await Team.findOne({ 
        where: { 
          name: { [Op.like]: `%${winnerName}%` } 
        } 
      });
      if (winnerTeam) {
        winnerId = winnerTeam.id;
      }
    }
    
    // 3. 预处理选手数据，推断 Team1 和 Team2
    const excelTeam1Players = [];
    const excelTeam2Players = [];
    const processedStats = [];
    
    // 遍历所有选手数据
    for (const stat of playerStats) {
      const excelName = stat.playerName;
      let playerId = null;
      let playerName = null;
      let heroId = null;
      let heroName = null;
      
      try {
        // 尝试查找选手
        let player = await Player.findOne({
          where: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            excelName.toLowerCase()
          )
        });
        
        // 2. 如果没找到，且名字含 -，尝试查找后缀
        if (!player && excelName.includes('-')) {
          const suffix = excelName.split('-').pop();
          player = await Player.findOne({
            where: sequelize.where(
              sequelize.fn('LOWER', sequelize.col('name')),
              suffix.toLowerCase()
            )
          });
        }
        
        if (player) {
            playerId = player.id;
            playerName = player.name;
        }
      } catch (e) {
          console.warn(`选手查找失败: ${excelName}`, e);
      }
      
      try {
        // 查找英雄
        if (stat.heroName) {
            const hero = await Hero.findOne({ where: { name: stat.heroName } });
            if (hero) {
                heroId = hero.id;
                heroName = hero.name;
            }
        }
      } catch (e) {
          console.warn(`英雄查找失败: ${stat.heroName}`, e);
      }

      // 记录选手归属的 Excel Team
      // Excel teamId 可能是 1/2 或 A/B
      const isTeam1 = (stat.teamId == 1 || stat.teamId == '1' || stat.teamId == 'A');
      if (playerId) {
          if (isTeam1) {
              excelTeam1Players.push(playerId);
          } else {
              excelTeam2Players.push(playerId);
          }
      }

      processedStats.push({
          ...stat,
          playerId,
          playerName: playerName || excelName, // Use original name if not found
          originalName: excelName,
          heroId,
          heroName: heroName || stat.heroName, // Use original name if not found
          isTeam1
      });
    }
    
    // 推断 Team 1 和 Team 2 的真实 ID
    const findTeamIdForPlayers = async (playerIds) => {
        if (playerIds.length === 0) return null;
        
        // 查找这些选手在当前赛季所属的队伍
        const seasonTeamPlayers = await SeasonTeamPlayer.findAll({
            where: {
                playerId: { [Op.in]: playerIds }
            },
            include: [{
                model: SeasonTeam,
                where: { seasonId: seasonId },
                required: true,
                include: [{ model: Team, as: 'Team' }]
            }]
        });
        
        if (seasonTeamPlayers.length === 0) return null;
        
        // 统计出现次数最多的 teamId
        const teamCounts = {};
        seasonTeamPlayers.forEach(stp => {
            const tid = stp.SeasonTeam.teamId;
            teamCounts[tid] = (teamCounts[tid] || 0) + 1;
        });
        
        // 找出最大值
        let maxTeamId = null;
        let maxCount = 0;
        for (const [tid, count] of Object.entries(teamCounts)) {
            if (count > maxCount) {
                maxCount = count;
                maxTeamId = tid;
            }
        }
        
        // 查找对应的 Team 对象
        let foundTeam = null;
        if (maxTeamId) {
            const stp = seasonTeamPlayers.find(s => s.SeasonTeam.teamId == maxTeamId);
            if (stp) foundTeam = stp.SeasonTeam.Team;
        }

        return { id: parseInt(maxTeamId), team: foundTeam };
    };

    const team1Result = await findTeamIdForPlayers(excelTeam1Players);
    const team2Result = await findTeamIdForPlayers(excelTeam2Players);
    
    const realTeam1Id = team1Result ? team1Result.id : null;
    const realTeam2Id = team2Result ? team2Result.id : null;

    if (!realTeam1Id || !realTeam2Id) {
        // 如果无法自动识别，尝试回退逻辑：如果只有两个队伍，且能识别出一个，另一个可能是剩余的那个（这里暂不处理复杂情况）
        throw new Error('无法自动识别队伍，请检查选手是否已注册到赛季队伍中');
    }
    
    // 如果 winnerId 没找到，尝试通过名称再次匹配
    if (!winnerId) {
         const team1 = team1Result.team;
         const team2 = team2Result.team;
         if (team1 && team1.name.includes(winnerName)) winnerId = realTeam1Id;
         else if (team2 && team2.name.includes(winnerName)) winnerId = realTeam2Id;
    }
    
    if (!winnerId) {
        throw new Error(`无法识别获胜队伍: ${winnerName}`);
    }

    // Attach inferred teams to processed stats
    const finalStats = processedStats.map(stat => {
        let teamId = null;
        let teamName = '';
        
        if (stat.playerId) {
            // If player is identified, use the inferred team logic
            teamId = stat.isTeam1 ? realTeam1Id : realTeam2Id;
            teamName = stat.isTeam1 ? (team1Result.team ? team1Result.team.name : '') : (team2Result.team ? team2Result.team.name : '');
        } else {
            // If player is not identified, try to map based on Excel teamId
            // This is a best-effort guess
            teamId = stat.isTeam1 ? realTeam1Id : realTeam2Id;
            teamName = stat.isTeam1 ? (team1Result.team ? team1Result.team.name : '') : (team2Result.team ? team2Result.team.name : '');
        }
        
        return {
            ...stat,
            teamId,
            teamName
        };
    });

    const warnings = [];
    finalStats.forEach(stat => {
        if (!stat.playerId) warnings.push(`无法识别选手: ${stat.originalName}`);
        if (stat.originalName && !stat.heroId && stat.heroName) warnings.push(`无法识别英雄: ${stat.heroName} (选手: ${stat.playerName})`);
    });

    return {
        map,
        winnerId,
        winnerName, // original winner name
        resolvedWinnerName: winnerId === realTeam1Id ? team1Result.team.name : team2Result.team.name,
        realTeam1Id,
        realTeam1Name: team1Result.team.name,
        realTeam2Id,
        realTeam2Name: team2Result.team.name,
        duration: mapData.duration,
        finalStats,
        warnings
    };
};

const MapGameController = {
  // 获取地图局编辑上下文数据
  getEditContext: async (req, res) => {
    try {
      const { id } = req.params;
      
      const mapGame = await MapGame.findByPk(id);
      if (!mapGame) {
        return res.status(404).json({ error: 'MapGame not found' });
      }
      
      const seasonId = mapGame.seasonId;
      const team1Id = mapGame.team1Id;
      const team2Id = mapGame.team2Id;

      const [playerStats, seasonTeams, team1Players, team2Players] = await Promise.all([
        // 1. 获取选手统计数据
        PlayerStat.findAll({ 
          where: { mapGameId: id },
          include: [
            { model: Player, as: 'player' },
            { model: Hero, as: 'hero' },
            { model: Team, as: 'team' },
            {
              model: PlayerHeroStat,
              as: 'heroStats',
              include: [{ model: Hero, as: 'hero' }]
            }
          ]
        }),
        // 2. 获取该赛季所有队伍
        SeasonTeam.findAll({
          where: { seasonId },
          include: [{ model: Team, as: 'Team' }]
        }),
        // 3. 获取队伍1的选手
        (async () => {
          const st = await SeasonTeam.findOne({ where: { seasonId, teamId: team1Id } });
          if (!st) return [];
          return SeasonTeamPlayer.findAll({
            where: { seasonTeamId: st.id },
            include: [{ model: Player, attributes: ['id', 'name', 'role'] }]
          });
        })(),
        // 4. 获取队伍2的选手
        (async () => {
          const st = await SeasonTeam.findOne({ where: { seasonId, teamId: team2Id } });
          if (!st) return [];
          return SeasonTeamPlayer.findAll({
            where: { seasonTeamId: st.id },
            include: [{ model: Player, attributes: ['id', 'name', 'role'] }]
          });
        })()
      ]);

      res.status(200).json({
        mapGame,
        playerStats,
        seasonTeams,
        team1Players,
        team2Players
      });
    } catch (error) {
      console.error('获取地图局编辑上下文失败:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // 预览地图数据
  previewMapData: async (req, res) => {
      try {
          const { seasonId, mapData, playerStats } = req.body;
          const result = await resolveImportData(seasonId, mapData, playerStats);
          res.status(200).json(result);
      } catch (error) {
          console.error('预览失败:', error);
          res.status(400).json({ error: error.message });
      }
  },

  // 导入地图数据
  importMapData: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { seasonId, mapData, playerStats } = req.body;
      
      const resolvedData = await resolveImportData(seasonId, mapData, playerStats);
      
      const { 
          map, winnerId, realTeam1Id, realTeam2Id, duration, finalStats 
      } = resolvedData;

      // 创建 MapGame
      const newMapGame = await MapGame.create({
          matchId: null, // 不关联 Match
          seasonId,
          team1Id: realTeam1Id,
          team2Id: realTeam2Id,
          mapId: map.id,
          winnerId: winnerId,
          duration: duration,
          team1BanHeroId: null,
          team2BanHeroId: null
      }, { transaction: t });

      // 创建 PlayerStats
      const statsToCreate = finalStats
        .filter(stat => stat.playerId) // Only create stats for identified players
        .map(stat => ({
          mapGameId: newMapGame.id,
          playerId: stat.playerId,
          heroId: stat.heroId,
          teamId: stat.teamId,
          kills: stat.kill || 0,
          deaths: stat.death || 0,
          assists: stat.assist || 0,
          damage: stat.damage || 0,
          healing: stat.cure || 0,
          mitigation: stat.resist || 0,
          finalBlows: stat.finalHit || 0,
          ultsUsed: 0
      }));

      if (statsToCreate.length > 0) {
        await PlayerStat.bulkCreate(statsToCreate, { transaction: t });
      }

      await t.commit();
      res.status(201).json({ 
          message: '导入成功', 
          mapGameId: newMapGame.id,
          skippedStats: finalStats.length - statsToCreate.length
      });

    } catch (error) {
      await t.rollback();
      console.error('导入失败:', error);
      res.status(400).json({ error: error.message });
    }
  },

  // 获取所有地图局
  getAll: async (req, res) => {
    try {
      const { seasonId, teamId, mapId, startDate, endDate, page = 1, pageSize = 10 } = req.query;
      
      // 构建筛选条件
      const where = {};
      if (seasonId) {
        where.seasonId = parseInt(seasonId);
      }
      if (teamId) {
        where[Op.or] = [
          { team1Id: parseInt(teamId) },
          { team2Id: parseInt(teamId) }
        ];
      }
      if (mapId) {
        where.mapId = parseInt(mapId);
      }
      if (startDate) {
        where.createdAt = {
          [Op.gte]: new Date(startDate)
        };
      }
      if (endDate) {
        where.createdAt = {
          ...where.createdAt,
          [Op.lte]: new Date(endDate)
        };
      }
      
      const mapGames = await MapGame.findAll({
        where,
        include: [
          { model: Team, as: 'winner' },
          { model: Map }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize)
      });
      
      res.status(200).json(mapGames);
    } catch (error) {
      console.error('获取地图局数据失败:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // 获取单个地图局
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const mapGame = await MapGame.findByPk(id, {
        include: ['winner', 'map']
      });
      if (!mapGame) {
        return res.status(404).json({ error: 'MapGame not found' });
      }
      res.status(200).json(mapGame);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 创建地图局
  create: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { playerStats, ...mapGameData } = req.body;
      const mapGame = await MapGame.create(mapGameData, { transaction: t });

      if (playerStats && Array.isArray(playerStats) && playerStats.length > 0) {
        const statsWithMapGameId = playerStats.map(stat => ({
          ...stat,
          mapGameId: mapGame.id
        }));
        await PlayerStat.bulkCreate(statsWithMapGameId, { transaction: t });
      }

      await t.commit();
      res.status(201).json(mapGame);
    } catch (error) {
      await t.rollback();
      res.status(400).json({ error: error.message });
    }
  },

  // 更新地图局
  update: async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { playerStats, ...mapGameData } = req.body;
      
      const mapGame = await MapGame.findByPk(id);
      if (!mapGame) {
        await t.rollback();
        return res.status(404).json({ error: 'MapGame not found' });
      }
      
      await mapGame.update(mapGameData, { transaction: t });

      if (playerStats && Array.isArray(playerStats)) {
        const existingStats = await PlayerStat.findAll({
          where: { mapGameId: id },
          attributes: ['id'],
          transaction: t
        });
        const existingStatIds = existingStats.map(stat => stat.id);
        if (existingStatIds.length > 0) {
          await PlayerHeroStat.destroy({
            where: { playerStatId: { [Op.in]: existingStatIds } },
            transaction: t
          });
        }
        await PlayerStat.destroy({ where: { mapGameId: id }, transaction: t });

        for (const stat of playerStats) {
          const statData = { ...stat };
          const heroStats = statData.heroStats || [];
          delete statData.heroStats;
          delete statData.id;
          delete statData.player;
          delete statData.hero;
          delete statData.team;
          const createdStat = await PlayerStat.create({
            ...statData,
            mapGameId: id
          }, { transaction: t });

          const normalizedHeroStats = (Array.isArray(heroStats) ? heroStats : [])
            .filter(heroStat => heroStat && (heroStat.heroId || heroStat.heroName))
            .map(heroStat => {
              const heroStatData = { ...heroStat };
              delete heroStatData.id;
              delete heroStatData.playerStatId;
              delete heroStatData.hero;
              delete heroStatData.editorKey;
              return {
                ...heroStatData,
                playerStatId: createdStat.id
              };
            });

          if (normalizedHeroStats.length > 0) {
            await PlayerHeroStat.bulkCreate(normalizedHeroStats, { transaction: t });
          }
        }
      }

      // 赛季聚合统计改为读取接口实时计算，这里不再重写预聚合表

      await t.commit();
      res.status(200).json(mapGame);
    } catch (error) {
      await t.rollback();
      res.status(400).json({ error: error.message });
    }
  },

  // 删除地图局
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const mapGame = await MapGame.findByPk(id);
      if (!mapGame) {
        return res.status(404).json({ error: 'MapGame not found' });
      }
      // 删除关联的选手统计数据
      const playerStats = await PlayerStat.findAll({
        where: { mapGameId: id },
        attributes: ['id']
      });
      const playerStatIds = playerStats.map(stat => stat.id);
      if (playerStatIds.length > 0) {
        await PlayerHeroStat.destroy({ where: { playerStatId: { [Op.in]: playerStatIds } } });
      }
      await PlayerStat.destroy({ where: { mapGameId: id } });
      // 删除地图局
      await mapGame.destroy();
      res.status(200).json({ message: 'MapGame deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 获取地图局的选手数据
  getPlayerStats: async (req, res) => {
    try {
      const { id } = req.params;
      console.log('获取地图局选手数据，ID:', id);
      
      const mapGame = await MapGame.findByPk(id);
      if (!mapGame) {
        console.log('地图局不存在，ID:', id);
        return res.status(404).json({ error: 'MapGame not found' });
      }
      
      console.log('开始查询选手统计数据');
      let playerStats = [];
      try {
        playerStats = await PlayerStat.findAll({ 
          where: { mapGameId: id },
          include: [
            { model: Player, as: 'player' },
            { model: Hero, as: 'hero' },
            { model: Team, as: 'team' }
          ]
        });
        console.log('查询到选手统计数据:', playerStats.length, '条');
      } catch (dbError) {
        console.error('查询选手统计数据时出错:', dbError);
        // 即使查询失败，也返回空数组，而不是抛出错误
        playerStats = [];
      }
      
      res.status(200).json(playerStats);
    } catch (error) {
      console.error('获取地图局选手数据失败:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = MapGameController;
