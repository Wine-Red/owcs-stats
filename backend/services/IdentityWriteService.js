const sequelize = require('../config/database');
const { IdentityWriteLock } = require('../models/EntityIdentity');

// Take this before catalog/membership reads. A database row serializes every
// process, and InnoDB releases it on commit, rollback or connection failure.
const lockIdentityWrites = async transaction => {
  if (!transaction) throw new Error('Identity writes require a transaction');
  if (transaction.identityWriteLocked) return;
  const row = await IdentityWriteLock.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
  if (!row) throw new Error('身份维护结构尚未初始化，请先完成数据库升级');
  transaction.identityWriteLocked = true;
};
const identityTransaction = work => sequelize.transaction(async transaction => {
  await lockIdentityWrites(transaction);
  return work(transaction);
});
module.exports = { lockIdentityWrites, identityTransaction };
