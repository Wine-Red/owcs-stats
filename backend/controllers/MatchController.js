const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const Config = require('../models/Config');
const Team = require('../models/Team');
const Season = require('../models/Season');
const Map = require('../models/Map');
const Player = require('../models/Player');
const sequelize = require('../config/database');

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
    let newMapGamesCount = 0;
    let updatedMapGamesCount = 0;
    let newPlayerStatsCount = 0;
    let updatedPlayerStatsCount = 0;
    const updatedMatches = [];
    const errors = [];

    for (const match of matchesData) {
      const t = await sequelize.transaction();
      try {
        let season = null;
        if (match.eventName) {
          season = await Season.findOne({
            where: sequelize.where(
              sequelize.fn('LOWER', sequelize.col('externalEventName')),
              match.eventName.toLowerCase()
            ),
            transaction: t
          });
          if (!season) {
            season = await Season.findOne({
              where: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('name')),
                match.eventName.toLowerCase()
              ),
              transaction: t
            });
          }
        }
        if (!season) {
          throw new Error(`未找到对应的赛季(eventName: ${match.eventName})`);
        }

        const team1 = await Team.findOne({
          where: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            match.teamA.name.toLowerCase()
          ),
          transaction: t
        });
        if (!team1) {
          throw new Error(`未找到对应的队伍: ${match.teamA.name}`);
        }

        const team2 = await Team.findOne({
          where: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            match.teamB.name.toLowerCase()
          ),
          transaction: t
        });
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
            const mapAliases = {
              '直布罗陀': '监测站：直布罗陀'
            };
            const searchMapName = mapAliases[round.mapName] || round.mapName;

            const map = await Map.findOne({
              where: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('name')),
                searchMapName.toLowerCase()
              ),
              transaction: t
            });
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

            const buildPlayerStatsPayload = async (players, teamId) => {
              if (!Array.isArray(players) || players.length === 0) {
                return [];
              }

              const payload = [];
              for (const p of players) {
                const player = await Player.findOne({
                  where: sequelize.where(
                    sequelize.fn('LOWER', sequelize.col('name')),
                    p.name.toLowerCase()
                  ),
                  transaction: t
                });
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
              ...(await buildPlayerStatsPayload(round.playersA, team1.id)),
              ...(await buildPlayerStatsPayload(round.playersB, team2.id))
            ];

            const existingPlayerStatsCount = await PlayerStat.count({
              where: { mapGameId: mapGame.id },
              transaction: t
            });

            if (playerStatsPayload.length > 0 || existingPlayerStatsCount > 0) {
              await PlayerStat.destroy({
                where: { mapGameId: mapGame.id },
                transaction: t
              });
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
  }
};

MatchController.runExternalMatchSync = runExternalMatchSync;

module.exports = MatchController;
