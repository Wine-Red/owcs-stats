const { createHash, randomUUID } = require('crypto');
const { Op } = require('sequelize');

const sourceKey = page => createHash('sha256').update(page).digest('hex');
const contentHash = payload => sourceKey(JSON.stringify({ ...payload, observedAt: undefined }));

function createTournamentSnapshotStore({ model = require('../models/TournamentSnapshot') } = {}) {
  const ensure = async source => {
    await model.findOrCreate({ where: { sourceKey: sourceKey(source.page) }, defaults: { page: source.page, sourceUrl: source.url } });
  };
  const read = (page, options = {}) => model.findByPk(sourceKey(page), { ...options, raw: true });
  const seed = async (source, payload) => {
    await ensure(source);
    // A legacy file can fill an empty row, but can never replace a DB snapshot.
    const [count] = await model.update({ payload, contentHash: contentHash(payload), lastSuccessAt: new Date(payload.observedAt), nextSyncAt: new Date(0) },
      { where: { sourceKey: sourceKey(source.page), payload: { [Op.is]: null }, syncToken: null } });
    return count > 0;
  };
  const claim = async (source, { now, intervalMs, leaseMs }) => {
    await ensure(source);
    const token = randomUUID(), at = new Date(now);
    const [count] = await model.update({ syncToken: token, leaseUntil: new Date(now + leaseMs), lastAttemptAt: at }, {
      where: {
        sourceKey: sourceKey(source.page),
        [Op.and]: [
          { [Op.or]: [{ leaseUntil: null }, { leaseUntil: { [Op.lte]: at } }] },
          { [Op.or]: [
            { nextSyncAt: null }, { nextSyncAt: { [Op.lte]: at } },
            // A newly active season may need a faster cadence than its previous one.
            { failureCount: 0, lastSuccessAt: { [Op.lte]: new Date(now - intervalMs) } }
          ] }
        ]
      }
    });
    if (!count) return null;
    const row = await read(source.page);
    return row?.syncToken === token ? row : null;
  };
  const owned = (page, token) => ({ sourceKey: sourceKey(page), syncToken: token });
  const renew = async (page, token, until) => {
    const [count] = await model.update({ leaseUntil: new Date(until) }, { where: owned(page, token) });
    return count > 0;
  };
  const complete = async (page, token, payload, nextSyncAt) => {
    const [count] = await model.update({ payload, contentHash: contentHash(payload), lastSuccessAt: new Date(payload.observedAt), nextSyncAt: new Date(nextSyncAt),
      failureCount: 0, lastError: null, syncToken: null, leaseUntil: null }, { where: owned(page, token) });
    return count > 0;
  };
  const fail = async (page, token, { failureCount, message, nextSyncAt }) => {
    const [count] = await model.update({ failureCount, lastError: String(message).slice(0, 2000), nextSyncAt: new Date(nextSyncAt),
      syncToken: null, leaseUntil: null }, { where: owned(page, token) });
    return count > 0;
  };
  return { read, seed, claim, renew, complete, fail };
}

module.exports = { createTournamentSnapshotStore, sourceKey };
