const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const Config = require('../models/Config');
const Team = require('../models/Team');
const Season = require('../models/Season');
const Map = require('../models/Map');
const Player = require('../models/Player');
const sequelize = require('../config/database');
const SeasonStatController = require('./SeasonStatController');

const SYNC_SUMMARY_CONFIG_KEY = 'latest_match_sync_updates';
const EXTERNAL_MATCH_API_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Origin: 'https://match.owmini.xyz',
  Pragma: 'no-cache',
  Referer: 'https://match.owmini.xyz/',
  'Sec-CH-UA': '"Chromium";v="135", "Not:A-Brand";v="8"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
};

let syncInProgress = false;

const parseDuration = (durationValue) => {
  if (!durationValue || typeof durationValue !== 'string') {
    return 0;
  }

  const parts = durationValue.split(':');
  if (parts.length !== 2) {
    return 0;
  }

  const minutes = parseInt(parts[0], 10) || 0;
  const seconds = parseInt(parts[1], 10) || 0;
  return minutes + seconds / 60;
};

const parseKad = (kadValue) => {
  let kills = 0;
  let assists = 0;
  let deaths = 0;

  if (kadValue) {
    const kadParts = String(kadValue).split('/');
    if (kadParts.length === 3) {
      kills = parseInt(kadParts[0], 10) || 0;
      assists = parseInt(kadParts[1], 10) || 0;
      deaths = parseInt(kadParts[2], 10) || 0;
    }
  }

  return { kills, assists, deaths };
};

const persistSyncSummary = async (summary) => {
  const [config, created] = await Config.findOrCreate({
    where: { key: SYNC_SUMMARY_CONFIG_KEY },
    defaults: {
      value: summary,
      description: '最近一次比赛同步的更新摘要'
    }
  });

  if (!created) {
    config.value = summary;
    config.description = '最近一次比赛同步的更新摘要';
    config.changed('value', true);
    await config.save();
  }
};

const fetchExternalMatches = async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch('https://match.owmini.xyz/api/matches', {
      method: 'GET',
      headers: EXTERNAL_MATCH_API_HEADERS,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`外部接口请求失败: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('外部接口请求超时');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const runExternalMatchSync = async ({ source = 'manual' } = {}) => {
  if (syncInProgress) {
    return {
      message: '同步进行中，已跳过本次请求',
      data: {
        skipped: true,
        source,
        errors: []
      }
    };
  }

  syncInProgress = true;

  try {
    const matchesDataRaw = await fetchExternalMatches();
    const matchesData = Array.isArray(matchesDataRaw) ? matchesDataRaw : [];
    let newMatchesCount = 0;
    let updatedMatchesCount = 0;

    // --- 加载并应用队伍名称映射 ---
    const mappingConfig = await Config.findByPk('team_name_mapping');
    const teamNameMapping = mappingConfig && mappingConfig.value ? mappingConfig.value : {};
    
    if (Object.keys(teamNameMapping).length > 0) {
      for (const match of matchesData) {
        if (match.teamA && match.teamA.name && teamNameMapping[match.teamA.name]) {
          match.teamA.name = teamNameMapping[match.teamA.name];
        }
        if (match.teamB && match.teamB.name && teamNameMapping[match.teamB.name]) {
          match.teamB.name = teamNameMapping[match.teamB.name];
        }
      }
    }
    // ------------------------------------------------

    let newMapGamesCount = 0;
    let updatedMapGamesCount = 0;
    let newPlayerStatsCount = 0;
    let updatedPlayerStatsCount = 0;
    const updatedMatches = [];
    const errors = [];

    // --- 内存缓存优化：预先加载所有基础数据字典，避免在循环中执行大量 N+1 查询 ---
    let [allSeasons, allTeams, allMaps, allPlayers] = await Promise.all([
      Season.findAll(),
      Team.findAll(),
      Map.findAll(),
      Player.findAll()
    ]);

    const getSeasonFromCache = (eventName) => {
      if (!eventName) return null;
      const name = String(eventName).toLowerCase();
      return allSeasons.find(s => 
        (s.externalEventName && s.externalEventName.toLowerCase() === name) || 
        (s.name && s.name.toLowerCase() === name)
      );
    };

    const getMapFromCache = (mapName) => {
      if (!mapName) return null;
      const mapAliases = { '直布罗陀': '监测站：直布罗陀' };
      const searchName = String(mapAliases[mapName] || mapName).toLowerCase();
      return allMaps.find(m => m.name && m.name.toLowerCase() === searchName);
    };

    const getPlayerFromCache = (playerName) => {
      if (!playerName) return null;
      const name = String(playerName).toLowerCase();
      return allPlayers.find(p => p.name && p.name.toLowerCase() === name);
    };
    // ----------------------------------------------------------------------

    // --- 自动导入赛季数据：在同步比赛明细之前，先根据所有比赛提取队伍和选手，并计算赛季聚合统计数据 ---
    const matchesBySeason = {};
    for (const match of matchesData) {
      if (match.eventName) {
        const s = getSeasonFromCache(match.eventName);
        if (s) {
          if (!matchesBySeason[s.id]) matchesBySeason[s.id] = [];
          matchesBySeason[s.id].push(match);
        }
      }
    }

    let seasonImportSummary = [];
    for (const [seasonIdStr, sMatches] of Object.entries(matchesBySeason)) {
      const sId = parseInt(seasonIdStr, 10);
      const tSeason = await sequelize.transaction();
      try {
        const importResult = await SeasonStatController.autoImportFromAPI(sMatches, sId, tSeason, teamNameMapping);
        await tSeason.commit();
        seasonImportSummary.push(`赛季ID ${sId} 聚合统计：更新 ${importResult.insertedCount} 名选手，${importResult.teamScoreCount} 支战队比分，${importResult.mapPickCount} 张地图选取`);
      } catch (err) {
        await tSeason.rollback();
        console.error(`Season Auto Import failed for seasonId ${sId}:`, err);
        errors.push(`赛季数据预导入失败 (seasonId: ${sId}): ${err.message}`);
      }
    }

    // 重新加载可能在上一阶段新创建的队伍和选手
    allTeams = await Team.findAll();
    allPlayers = await Player.findAll();

    const getTeamFromCache = (teamName) => {
      if (!teamName) return null;
      const name = String(teamName).toLowerCase();
      return allTeams.find(t => t.name && t.name.toLowerCase() === name);
    };

    for (const match of matchesData) {
      const t = await sequelize.transaction();
      try {
        let season = null;
        if (match.eventName) {
          season = getSeasonFromCache(match.eventName);
        }
        if (!season) {
          throw new Error(`未找到对应的赛季(eventName: ${match.eventName})`);
        }

        const team1 = getTeamFromCache(match.teamA.name);
        if (!team1) {
          throw new Error(`未找到对应的队伍: ${match.teamA.name}`);
        }

        const team2 = getTeamFromCache(match.teamB.name);
        if (!team2) {
          throw new Error(`未找到对应的队伍: ${match.teamB.name}`);
        }

        const winnerId = match.scoreA > match.scoreB ? team1.id : team2.id;
        let matchDate = match.matchDate;
        if (!matchDate) {
          if (match.createdAt) {
            matchDate = match.createdAt.split('T')[0];
          } else {
            matchDate = new Date().toISOString().split('T')[0];
          }
        }

        const [dbMatch, created] = await Match.findOrCreate({
          where: { externalId: match.id },
          defaults: {
            seasonId: season.id,
            team1Id: team1.id,
            team2Id: team2.id,
            winnerId,
            matchDate,
            boFormat: match.boFormat,
            team1Score: match.scoreA,
            team2Score: match.scoreB
          },
          transaction: t
        });

        let matchUpdated = false;
        let updatedMapGamesForMatch = 0;
        let updatedPlayerStatsForMatch = 0;

        if (!created) {
          const matchUpdatePayload = {
            seasonId: season.id,
            team1Id: team1.id,
            team2Id: team2.id,
            winnerId,
            matchDate,
            boFormat: match.boFormat,
            team1Score: match.scoreA,
            team2Score: match.scoreB
          };
          const hasMatchChanges = Object.entries(matchUpdatePayload).some(([key, value]) => dbMatch[key] !== value);
          if (hasMatchChanges) {
            await dbMatch.update(matchUpdatePayload, { transaction: t });
            updatedMatchesCount++;
            matchUpdated = true;
          }
        } else {
          newMatchesCount++;
        }

        if (match.rounds && match.rounds.length > 0) {
          for (const round of match.rounds) {
            const map = getMapFromCache(round.mapName);
            if (!map) {
              throw new Error(`未找到对应的地图: ${round.mapName}`);
            }

            const mapGamePayload = {
              seasonId: season.id,
              team1Id: team1.id,
              team2Id: team2.id,
              winnerId: round.winner === 'A' ? team1.id : team2.id,
              duration: parseDuration(round.duration),
              team1Score: round.roundScoreA,
              team2Score: round.roundScoreB,
              replayId: round.replayId || null
            };

            const [mapGame, mapGameCreated] = await MapGame.findOrCreate({
              where: {
                matchId: dbMatch.id,
                mapId: map.id
              },
              defaults: mapGamePayload,
              transaction: t
            });

            if (mapGameCreated) {
              newMapGamesCount++;
            } else {
              const hasMapGameChanges = Object.entries(mapGamePayload).some(([key, value]) => mapGame[key] !== value);
              if (hasMapGameChanges) {
                await mapGame.update(mapGamePayload, { transaction: t });
                updatedMapGamesCount++;
                updatedMapGamesForMatch++;
              }
            }

            const buildPlayerStatsPayload = (players, teamId) => {
              if (!Array.isArray(players) || players.length === 0) {
                return [];
              }

              const payload = [];
              for (const p of players) {
                // Find player by name AND role
                const nameLower = String(p.name).toLowerCase();
                const pRole = p.role === 'T' ? 'tank' : p.role === 'D' ? 'damage' : p.role === 'S' ? 'support' : String(p.role).toLowerCase();
                
                // Match the specific role variant if available, otherwise fallback to the first one found
                const matchingPlayers = allPlayers.filter(player => player.name && player.name.toLowerCase() === nameLower);
                let player = matchingPlayers.find(player => player.role === pRole);
                if (!player && matchingPlayers.length > 0) {
                  player = matchingPlayers[0];
                }

                if (!player) {
                  throw new Error(`未找到对应的选手: ${p.name}`);
                }

                const { kills, assists, deaths } = parseKad(p.kad);
                payload.push({
                  mapGameId: mapGame.id,
                  playerId: player.id,
                  teamId,
                  kills,
                  assists,
                  deaths,
                  damage: p.damage || 0,
                  healing: p.healing || 0,
                  mitigation: p.blocked || 0
                });
              }
              return payload;
            };

            const playerStatsPayload = [
              ...buildPlayerStatsPayload(round.playersA, team1.id),
              ...buildPlayerStatsPayload(round.playersB, team2.id)
            ];

            let existingPlayerStatsCount = 0;
            if (!mapGameCreated) {
              existingPlayerStatsCount = await PlayerStat.count({
                where: { mapGameId: mapGame.id },
                transaction: t
              });
            }

            if (playerStatsPayload.length > 0 || existingPlayerStatsCount > 0) {
              if (!mapGameCreated && existingPlayerStatsCount > 0) {
                await PlayerStat.destroy({
                  where: { mapGameId: mapGame.id },
                  transaction: t
                });
              }
              if (playerStatsPayload.length > 0) {
                await PlayerStat.bulkCreate(playerStatsPayload, { transaction: t });
              }

              if (mapGameCreated) {
                newPlayerStatsCount += playerStatsPayload.length;
              } else {
                updatedPlayerStatsCount += playerStatsPayload.length;
                updatedPlayerStatsForMatch += playerStatsPayload.length;
              }
            }
          }
        }

        if (!created && (matchUpdated || updatedMapGamesForMatch > 0 || updatedPlayerStatsForMatch > 0)) {
          updatedMatches.push({
            matchId: dbMatch.id,
            externalId: dbMatch.externalId,
            seasonId: season.id,
            seasonName: season.name,
            team1Id: team1.id,
            team1Name: team1.name,
            team2Id: team2.id,
            team2Name: team2.name,
            winnerId,
            team1Score: match.scoreA,
            team2Score: match.scoreB,
            matchDate,
            boFormat: match.boFormat || '',
            updatedMatch: matchUpdated,
            updatedMapGamesCount: updatedMapGamesForMatch,
            updatedPlayerStatsCount: updatedPlayerStatsForMatch,
            syncedAt: new Date().toISOString()
          });
        }

        await t.commit();
      } catch (err) {
        await t.rollback();
        errors.push(`[${match.teamA?.name} vs ${match.teamB?.name}] ${err.message}`);
      }
    }

    const syncSummary = {
      source,
      lastSyncAt: new Date().toISOString(),
      newMatchesCount,
      updatedMatchesCount,
      newMapGamesCount,
      updatedMapGamesCount,
      newPlayerStatsCount,
      updatedPlayerStatsCount,
      updatedMatches: updatedMatches.slice(0, 20),
      seasonImportSummary,
      errors
    };

    await persistSyncSummary(syncSummary);

    return {
      message: errors.length > 0 ? '部分同步完成' : '同步完成',
      data: syncSummary
    };
  } finally {
    syncInProgress = false;
  }
};

const MatchController = {
  // 获取所有比赛
  getAll: async (req, res) => {
    try {
      const { page = 1, pageSize = 10, seasonId, teamId, mapId, startDate, endDate } = req.query;
      
      const where = {};
      if (seasonId) where.seasonId = seasonId;
      if (teamId) {
        // 如果传入了 teamId，需要匹配 team1Id 或 team2Id
        const { Op } = require('sequelize');
        where[Op.or] = [
          { team1Id: teamId },
          { team2Id: teamId }
        ];
      }
      if (startDate && endDate) {
        const { Op } = require('sequelize');
        where.matchDate = {
          [Op.between]: [startDate, endDate]
        };
      } else if (startDate) {
        const { Op } = require('sequelize');
        where.matchDate = {
          [Op.gte]: startDate
        };
      } else if (endDate) {
        const { Op } = require('sequelize');
        where.matchDate = {
          [Op.lte]: endDate
        };
      }

      // 如果有 mapId 过滤条件，则需要连表过滤 MapGame
      let includeMapGame = null;
      if (mapId) {
        includeMapGame = {
          model: MapGame,
          as: 'mapGames',
          where: { mapId },
          required: true,
          attributes: []
        };
      }

      const limit = parseInt(pageSize, 10);
      const offset = (parseInt(page, 10) - 1) * limit;

      const includeArr = [
        { model: Season },
        { model: Team, as: 'team1' },
        { model: Team, as: 'team2' },
        { model: Team, as: 'winner' }
      ];
      if (includeMapGame) includeArr.push(includeMapGame);

      const { count, rows } = await Match.findAndCountAll({
        where,
        include: includeArr,
        limit,
        offset,
        order: [['matchDate', 'DESC'], ['createdAt', 'DESC']],
        distinct: true
      });

      // 手动计算没有分页时的真实 total (如果带 mapId 等多表条件，findAndCountAll 可能受影响，这里用 distinct: true 通常可以解决，但是我们可以确保前端收到正确分页信息)
      res.status(200).json({
        total: count,
        list: rows
      });
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
      
      // 获取所有关联的地图局ID
      const mapGames = await MapGame.findAll({ where: { matchId: id } });
      const mapGameIds = mapGames.map(mg => mg.id);
      
      // 在事务中级联删除
      await sequelize.transaction(async (t) => {
        if (mapGameIds.length > 0) {
          // 1. 删除地图局下的选手统计数据
          await PlayerStat.destroy({ 
            where: { mapGameId: mapGameIds },
            transaction: t
          });
          
          // 2. 删除关联的地图局
          await MapGame.destroy({ 
            where: { matchId: id },
            transaction: t
          });
        }
        
        // 3. 删除比赛
        await match.destroy({ transaction: t });
      });
      
      res.status(200).json({ message: 'Match deleted successfully' });
    } catch (error) {
      console.error('Delete match error:', error);
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
        include: [
          { model: Team, as: 'winner' },
          { model: Map }
        ]
      });
      res.status(200).json(mapGames);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 从外部API同步比赛数据
  syncExternalMatches: async (req, res) => {
    try {
      const result = await runExternalMatchSync({ source: 'manual' });
      res.status(200).json(result);
    } catch (error) {
      console.error('同步外部API失败:', error);
      res.status(400).json({ error: error.message });
    }
  },

  // 导出比赛数据
  exportMatches: async (req, res) => {
    try {
      const { matchIds } = req.body;
      if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
        return res.status(400).json({ error: 'matchIds is required and must be a non-empty array' });
      }

      const xlsx = require('xlsx');

      // 获取比赛数据，包含MapGame和PlayerStat
      const matches = await Match.findAll({
        where: { id: matchIds },
        include: [
          { model: Team, as: 'team1' },
          { model: Team, as: 'team2' },
          { model: Team, as: 'winner' },
        ]
      });

      if (matches.length === 0) {
        return res.status(404).json({ error: 'No matches found for the given IDs' });
      }

      const mapGames = await MapGame.findAll({
        where: { matchId: matchIds },
        include: [
          { model: Map },
          { model: Team, as: 'winner' }
        ]
      });

      const playerStats = await PlayerStat.findAll({
        where: { mapGameId: mapGames.map(mg => mg.id) },
        include: [
          { model: Player, as: 'player' },
          { model: Team, as: 'team' }
        ]
      });

      // 1. 选手数据总表
      const playerAgg = {};
      const mapGameDurationMap = {};
      mapGames.forEach(mg => {
        mapGameDurationMap[mg.id] = mg.duration || 0;
      });

      playerStats.forEach(ps => {
        if (!ps.player) return;
        const pId = ps.playerId;
        if (!playerAgg[pId]) {
          let roleDisplay = ps.player.role;
          if (roleDisplay === 'tank') roleDisplay = 'Tank';
          else if (roleDisplay === 'support') roleDisplay = 'Support';
          else if (roleDisplay === 'damage') roleDisplay = 'DPS';

          playerAgg[pId] = {
            Player: ps.player.name,
            Roles: roleDisplay,
            Team: ps.team ? ps.team.name : '',
            Elims: 0,
            Assists: 0,
            Deaths: 0,
            DMG: 0,
            Healing: 0,
            Mit: 0,
            GameTime: 0,
            seenMapGames: new Set()
          };
        }

        const p = playerAgg[pId];
        p.Elims += ps.kills || 0;
        p.Assists += ps.assists || 0;
        p.Deaths += ps.deaths || 0;
        p.DMG += ps.damage || 0;
        p.Healing += ps.healing || 0;
        p.Mit += ps.mitigation || 0;

        if (!p.seenMapGames.has(ps.mapGameId)) {
          p.seenMapGames.add(ps.mapGameId);
          p.GameTime += mapGameDurationMap[ps.mapGameId] || 0;
        }
      });

      const roleOrder = { 'Tank': 1, 'DPS': 2, 'Support': 3 };

      const sheet1Data = Object.values(playerAgg).map(p => {
        const timeMins = p.GameTime;
        const kd = p.Deaths === 0 ? p.Elims : p.Elims / p.Deaths;
        const kad = p.Deaths === 0 ? (p.Elims + p.Assists) : (p.Elims + p.Assists) / p.Deaths;
        return {
          'Player': p.Player,
          'Roles': p.Roles,
          'Team': p.Team,
          'Elims': p.Elims,
          'Assists': p.Assists,
          'Deaths': p.Deaths,
          'DMG': p.DMG,
          'Healing': p.Healing,
          'Mit': p.Mit,
          'Game Time': p.GameTime,
          ' ': '', // Empty column separator
          'K/D': kd,
          'KA/D': kad,
          '  ': '', // Empty column separator
          'Elims / 10min': timeMins > 0 ? (p.Elims * 10 / timeMins) : 0,
          'Assists / 10min': timeMins > 0 ? (p.Assists * 10 / timeMins) : 0,
          'Deaths / 10min': timeMins > 0 ? (p.Deaths * 10 / timeMins) : 0,
          'DMG / 10min': timeMins > 0 ? (p.DMG * 10 / timeMins) : 0,
          'Mit / 10min': timeMins > 0 ? (p.Mit * 10 / timeMins) : 0,
          'Heals / 10min': timeMins > 0 ? (p.Healing * 10 / timeMins) : 0
        };
      }).sort((a, b) => {
        // 优先按队伍名字母排序
        const teamComp = a.Team.localeCompare(b.Team);
        if (teamComp !== 0) return teamComp;
        // 队伍相同则按位置排序: Tank(1) -> DPS(2) -> Support(3)
        return (roleOrder[a.Roles] || 99) - (roleOrder[b.Roles] || 99);
      });

      // 2. 战队比分统计
      const teamAgg = {};
      matches.forEach(m => {
        const addTeam = (team) => {
          if (!team) return;
          if (!teamAgg[team.id]) {
            teamAgg[team.id] = {
              name: team.name,
              shortName: team.name,
              matchWins: 0,
              matchLosses: 0,
              mapWins: 0,
              mapLosses: 0
            };
          }
        };
        addTeam(m.team1);
        addTeam(m.team2);

        if (m.winnerId && teamAgg[m.winnerId]) {
          teamAgg[m.winnerId].matchWins++;
          const loserId = m.team1Id === m.winnerId ? m.team2Id : m.team1Id;
          if (teamAgg[loserId]) {
            teamAgg[loserId].matchLosses++;
          }
        }
      });

      mapGames.forEach(mg => {
        if (mg.winnerId && teamAgg[mg.winnerId]) {
          teamAgg[mg.winnerId].mapWins++;
          // mg.team1Id 和 mg.team2Id 可能在某些情况下与 match 里的队伍对调
          // 应该从 mg 中找到另外一个队伍
          let loserId = null;
          if (mg.team1Id && mg.team1Id !== mg.winnerId) loserId = mg.team1Id;
          else if (mg.team2Id && mg.team2Id !== mg.winnerId) loserId = mg.team2Id;

          // 回退策略：如果 mapGame 本身没存对战双方（仅关联match），则从关联的 match 中找失败方
          if (!loserId) {
             const match = matches.find(m => m.id === mg.matchId);
             if (match) {
                 loserId = match.team1Id === mg.winnerId ? match.team2Id : match.team1Id;
             }
          }
          
          if (loserId && teamAgg[loserId]) {
            teamAgg[loserId].mapLosses++;
          }
        }
      });

      const sheet2Data = Object.values(teamAgg).map(t => {
        return {
          '战队名称': t.name,
          '战队简称': t.shortName,
          '大比分胜': t.matchWins,
          '大比分负': t.matchLosses,
          '净胜大比分': t.matchWins - t.matchLosses,
          '小比分胜': t.mapWins,
          '小比分负': t.mapLosses,
          '净胜小比分': t.mapWins - t.mapLosses
        };
      });

      // 3. 地图选取次数
      const mapAgg = {};
      mapGames.forEach(mg => {
        if (mg.Map) {
          const mapName = mg.Map.name;
          mapAgg[mapName] = (mapAgg[mapName] || 0) + 1;
        }
      });
      const sheet3Data = Object.entries(mapAgg)
        .map(([name, count]) => ({ '地图名称': name, '选取次数': count }))
        .sort((a, b) => b['选取次数'] - a['选取次数']);

      // 生成 Excel
      const wb = xlsx.utils.book_new();
      const ws1 = xlsx.utils.json_to_sheet(sheet1Data);
      const ws2 = xlsx.utils.json_to_sheet(sheet2Data);
      const ws3 = xlsx.utils.json_to_sheet(sheet3Data);

      xlsx.utils.book_append_sheet(wb, ws1, '选手数据总表');
      xlsx.utils.book_append_sheet(wb, ws2, '战队比分统计');
      xlsx.utils.book_append_sheet(wb, ws3, '地图选取次数');

      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename="matches_export.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);

    } catch (error) {
      console.error('导出比赛数据失败:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

MatchController.runExternalMatchSync = runExternalMatchSync;

module.exports = MatchController;
