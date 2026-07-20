// 验证 getPlayerProfile 同款查询能否取到比赛级比分
const sequelize = require('../config/database');
const PlayerStat = require('../models/PlayerStat');
const MapGame = require('../models/MapGame');
const Match = require('../models/Match');
const Player = require('../models/Player');

PlayerStat.belongsTo(MapGame, { foreignKey: 'mapGameId' });

(async () => {
  const player = await Player.findOne({ where: { name: 'SUNZO' } }) || await Player.findOne();
  const rows = await PlayerStat.findAll({
    where: { playerId: player.id },
    include: [{
      model: MapGame,
      attributes: ['id', 'seasonId', 'matchId', 'winnerId'],
      include: [{ model: Match, attributes: ['id', 'matchDate', 'team1Id', 'team2Id', 'winnerId', 'team1Score', 'team2Score', 'boFormat'] }]
    }],
    order: [['id', 'DESC']],
    limit: 5
  });
  console.log(`player: ${player.name} (id=${player.id})`);
  for (const r of rows) {
    const m = r.MapGame?.Match;
    console.log(`mapGame=${r.mapGameId} match=${m?.id} date=${m?.matchDate} winner=${m?.winnerId} score=${m?.team1Score}:${m?.team2Score} bo=${m?.boFormat}`);
  }
  await sequelize.close();
})().catch(e => { console.error(e); process.exit(1); });
