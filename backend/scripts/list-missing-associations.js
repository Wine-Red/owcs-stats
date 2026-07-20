// 列出缺失的 赛季-队伍-选手 关联明细
const sequelize = require('../config/database');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const Season = require('../models/Season');
const Team = require('../models/Team');
const Player = require('../models/Player');

(async () => {
  const existingST = await SeasonTeam.findAll({ raw: true });
  const stByKey = new Map(existingST.map(r => [`${r.seasonId}:${r.teamId}`, r.id]));

  const mapSeason = new Map((await MapGame.findAll({ attributes: ['id', 'seasonId'], raw: true })).map(g => [g.id, g.seasonId]));
  const psRows = await PlayerStat.findAll({ attributes: ['mapGameId', 'teamId', 'playerId'], raw: true });
  const neededSTP = new Map(); // key -> {stId, playerId, teamId, seasonId}
  for (const r of psRows) {
    const seasonId = mapSeason.get(r.mapGameId);
    const stId = stByKey.get(`${seasonId}:${r.teamId}`);
    if (stId) neededSTP.set(`${stId}:${r.playerId}`, { stId, playerId: r.playerId, teamId: r.teamId, seasonId });
  }

  const existingSTP = await SeasonTeamPlayer.findAll({ raw: true });
  const existingSTPKeys = new Set(existingSTP.map(r => `${r.seasonTeamId}:${r.playerId}`));
  const missing = [...neededSTP.entries()].filter(([k]) => !existingSTPKeys.has(k)).map(([, v]) => v);

  const seasons = new Map((await Season.findAll({ raw: true })).map(s => [s.id, s.name]));
  const teams = new Map((await Team.findAll({ raw: true })).map(t => [t.id, t.name]));
  const players = new Map((await Player.findAll({ raw: true })).map(p => [p.id, p]));

  for (const m of missing) {
    const p = players.get(m.playerId);
    console.log(`赛季[${seasons.get(m.seasonId)}] 队伍[${teams.get(m.teamId)}] 选手[${p?.name}] 角色[${p?.role}] (seasonTeamId=${m.stId}, playerId=${m.playerId})`);
  }
  await sequelize.close();
})().catch(e => { console.error(e); process.exit(1); });
