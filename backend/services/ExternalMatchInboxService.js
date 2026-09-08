const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Inbox = require('../models/ExternalMatchInbox');
const Config = require('../models/Config');

const CURSOR_KEY = 'external_match_capture_cursor_v3';
const APPLIED_CURSOR_KEY = 'external_match_sync_cursor_v2';
const versionOf = item => `${item.sourceUpdatedAt || item.updatedAt}:${item.operation}`;
const validateChange = item => {
  if (!item?.id || String(item.id).length > 160 || !['upsert', 'delete'].includes(item.operation)
      || typeof item.updatedAt !== 'string' || item.updatedAt.length > 40 || !Number.isFinite(Date.parse(item.updatedAt))) {
    throw new Error('External match change is missing a valid id, operation or updatedAt');
  }
};

const createExternalMatchInboxService = ({
  database = sequelize, inbox = Inbox, config = Config, now = () => new Date()
} = {}) => {
  const enqueue = async (item, transaction, force = false) => {
    validateChange(item);
    const [row] = await inbox.findOrCreate({
      where: { externalId: String(item.id) },
      defaults: { sourceUpdatedAt: item.updatedAt, operation: item.operation, nextAttemptAt: now() },
      transaction
    });
    const locked = await inbox.findByPk(row.externalId, { transaction, lock: transaction.LOCK.UPDATE });
    if (versionOf(locked) > versionOf(item)) return locked;
    if (versionOf(locked) < versionOf(item) || force) {
      await locked.update({
        sourceUpdatedAt: item.updatedAt, operation: item.operation, status: 'pending',
        attempts: 0, nextAttemptAt: now(), lastError: null
      }, { transaction });
    }
    return locked;
  };

  const appliedCursor = async transaction => (await config.findByPk(APPLIED_CURSOR_KEY, {transaction}))?.value?.cursor || null;
  const cursor = async () => {
    const captured = await config.findByPk(CURSOR_KEY);
    return captured ? captured.value?.cursor || null : appliedCursor();
  };
  const lockCapture = async transaction => {
    const initial = await appliedCursor(transaction);
    await config.findOrCreate({where: {key: CURSOR_KEY}, defaults: {
      value: {cursor: initial}, description: 'External match captured cursor'
    }, transaction});
    return config.findByPk(CURSOR_KEY, {transaction, lock: transaction.LOCK.UPDATE});
  };
  const capture = async (page, expectedCursor) => database.transaction(async transaction => {
    // Lock the cursor before rows so overlapping schedulers cannot regress the stream.
    const marker = await lockCapture(transaction);
    if ((marker.value?.cursor || null) !== expectedCursor) return false;
    for (const item of page.items) await enqueue(item, transaction);
    await marker.update({value: {
      schemaVersion: page.schemaVersion, cursor: page.nextCursor ?? expectedCursor,
      generatedAt: page.generatedAt, savedAt: now().toISOString()
    }}, {transaction});
    return true;
  });

  const pending = async (limit = 200) => inbox.findAll({
    where: {status: 'pending', nextAttemptAt: {[Op.lte]: now()}},
    order: [['nextAttemptAt', 'ASC'], ['externalId', 'ASC']], limit
  });

  const apply = async (candidate, applyChange) => {
    try {
      return await database.transaction(async transaction => {
        const row = await inbox.findByPk(candidate.externalId, {transaction, lock: transaction.LOCK.UPDATE});
        if (!row || row.status !== 'pending' || versionOf(row) !== versionOf(candidate)) return {skipped: true};
        const result = await applyChange(row, transaction);
        await row.update({status: 'applied', appliedAt: now(), lastError: null}, {transaction});
        return {result};
      });
    } catch (error) {
      // Failure accounting is committed separately from the rolled-back match mutation.
      await database.transaction(async transaction => {
        const row = await inbox.findByPk(candidate.externalId, {transaction, lock: transaction.LOCK.UPDATE});
        if (!row || row.status !== 'pending' || versionOf(row) !== versionOf(candidate)) return;
        const attempts = row.attempts + 1;
        const delay = Math.min(60 * 60_000, 30_000 * 2 ** Math.min(attempts - 1, 7));
        await row.update({attempts, nextAttemptAt: new Date(now().getTime() + delay),
          lastError: String(error.message || error).slice(0, 2000)}, {transaction});
      });
      return {error: {externalId: candidate.externalId, message: error.message || String(error)}};
    }
  };

  const summary = async () => {
    const pendingCount = await inbox.count({where: {status: 'pending'}});
    const failedCount = await inbox.count({where: {status: 'pending', attempts: {[Op.gt]: 0}}});
    const failures = await inbox.findAll({where: {status: 'pending', attempts: {[Op.gt]: 0}},
      attributes: ['externalId', 'operation', 'sourceUpdatedAt', 'attempts', 'nextAttemptAt', 'lastError'],
      order: [['nextAttemptAt', 'ASC']], limit: 20, raw: true});
    return {pendingCount, failedCount, failures};
  };

  const markApplied = expectedCursor => database.transaction(async transaction => {
    const marker = await lockCapture(transaction);
    if ((marker.value?.cursor || null) !== expectedCursor) return false;
    // Locking reads observe the latest commit under MySQL REPEATABLE READ as well.
    if (await inbox.findOne({where: {status: 'pending'}, transaction, lock: transaction.LOCK.UPDATE})) return false;
    // Keep the old cursor safe for rollback: older application versions will replay unfinished work.
    const [applied] = await config.findOrCreate({where: {key: APPLIED_CURSOR_KEY}, defaults: {
      value: {cursor: null}, description: 'External match fully applied cursor'
    }, transaction});
    await applied.update({value: {...marker.value, savedAt: now().toISOString()}}, {transaction});
    return true;
  });

  return {cursor, appliedCursor, capture, pending, apply, summary, markApplied,
    enqueueOne: (item, force = false) => database.transaction(async transaction => {
      await lockCapture(transaction);
      return enqueue(item, transaction, force);
    })};
};

module.exports = {createExternalMatchInboxService, versionOf, validateChange};
