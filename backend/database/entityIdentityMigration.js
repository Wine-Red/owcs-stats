const Player = require('../models/Player');
const { IdentityWriteLock } = require('../models/EntityIdentity');
const { identityTransaction } = require('../services/IdentityWriteService');
const { bindExternalIdentity } = require('../services/PlayerIdentityService');

const migrateEntityIdentities = async () => {
  await IdentityWriteLock.findOrCreate({ where: { id: 1 } });
  return identityTransaction(async transaction => {
    const players = await Player.findAll({ transaction, order: [['id', 'ASC']] });
    for (const player of players) if (player.externalId) await bindExternalIdentity(player, player.externalId, transaction);
  });
};
module.exports = { migrateEntityIdentities };
