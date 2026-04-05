const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const Team = require('../models/Team');
const Season = require('../models/Season');
const Map = require('../models/Map');
const Player = require('../models/Player');
const sequelize = require('../config/database');
const axios = require('axios');

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
      const response = await axios.get('https://match.owmini.xyz/api/matches', { timeout: 60000 });
      const matchesData = response.data;

      let newMatchesCount = 0;
      let newMapGamesCount = 0;
      let newPlayerStatsCount = 0;
      let errors = [];

      for (const match of matchesData) {
        const t = await sequelize.transaction();
        try {
          // 1. 匹配 Season
          let season = null;
          if (match.eventName) {
            season = await Season.findOne({
              where: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('externalEventName')),
                match.eventName.toLowerCase()
              ),
              transaction: t
            });
            // 降级使用 name 匹配
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

          // 2. 匹配 Teams
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

          // 3. 匹配 Match
          const winnerId = match.scoreA > match.scoreB ? team1.id : team2.id;
          
          // 处理 matchDate: 有的 API 数据可能没有 matchDate 或者为 null/空字符串，降级使用 createdAt 或者回退到今天
          let matchDate = match.matchDate;
          if (!matchDate) {
             if (match.createdAt) {
               matchDate = match.createdAt.split('T')[0]; // 取日期部分
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
              winnerId: winnerId,
              matchDate: matchDate,
              boFormat: match.boFormat,
              team1Score: match.scoreA,
              team2Score: match.scoreB
            },
            transaction: t
          });

          // 更新现有比赛的大场比分信息
          if (!created) {
            await dbMatch.update({
              team1Score: match.scoreA,
              team2Score: match.scoreB,
              winnerId: winnerId
            }, { transaction: t });
          } else {
            newMatchesCount++;
          }

          // 4. 匹配 MapGames
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

              let duration = 0;
              if (round.duration) {
                const parts = round.duration.split(':');
                if (parts.length === 2) {
                  duration = parseInt(parts[0]) + parseInt(parts[1]) / 60;
                }
              }

              const mapGameWinnerId = round.winner === 'A' ? team1.id : team2.id;

              const [mapGame, mapGameCreated] = await MapGame.findOrCreate({
                where: { 
                  matchId: dbMatch.id, 
                  mapId: map.id 
                },
                defaults: {
                  seasonId: season.id,
                  team1Id: team1.id,
                  team2Id: team2.id,
                  winnerId: mapGameWinnerId,
                  duration: duration,
                  team1Score: round.roundScoreA,
                  team2Score: round.roundScoreB,
                  replayId: round.replayId
                },
                transaction: t
              });

              if (!mapGameCreated) {
                continue; // 这局地图已同步，跳过
              }
              newMapGamesCount++;

              // 5. 匹配 PlayerStats
              const processPlayers = async (players, teamId) => {
                if (!players) return;
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

                  let kills = 0, assists = 0, deaths = 0;
                  if (p.kad) {
                    const kadParts = p.kad.split('/');
                    if (kadParts.length === 3) {
                      kills = parseInt(kadParts[0]) || 0;
                      assists = parseInt(kadParts[1]) || 0;
                      deaths = parseInt(kadParts[2]) || 0;
                    }
                  }

                  await PlayerStat.create({
                    mapGameId: mapGame.id,
                    playerId: player.id,
                    teamId: teamId,
                    kills: kills,
                    assists: assists,
                    deaths: deaths,
                    damage: p.damage || 0,
                    healing: p.healing || 0,
                    mitigation: p.blocked || 0
                  }, { transaction: t });
                  newPlayerStatsCount++;
                }
              };

              await processPlayers(round.playersA, team1.id);
              await processPlayers(round.playersB, team2.id);
            }
          }

          await t.commit();
        } catch (err) {
          await t.rollback();
          // 不抛出异常，而是记录错误并继续处理下一场比赛
          errors.push(`[${match.teamA?.name} vs ${match.teamB?.name}] ${err.message}`);
          continue; 
        }
      }

      res.status(200).json({
        message: errors.length > 0 ? '部分同步完成' : '同步完成',
        data: { newMatchesCount, newMapGamesCount, newPlayerStatsCount, errors }
      });
    } catch (error) {
      console.error('同步外部API失败:', error);
      res.status(400).json({ error: error.message });
    }
  }
};

module.exports = MatchController;