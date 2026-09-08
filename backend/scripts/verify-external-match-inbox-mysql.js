// Opt-in integration verification. Never runs against the application database.
const assert = require('node:assert/strict');
if (process.env.DB_NAME !== 'owcs_sync_verification' || process.env.OWCS_ISOLATED_MYSQL !== '1') {
  throw new Error('Requires a disposable owcs_sync_verification database and OWCS_ISOLATED_MYSQL=1');
}
const sequelize = require('../config/database');
const { initDatabase } = require('../database');
const Config = require('../models/Config');
const Inbox = require('../models/ExternalMatchInbox');
const Season = require('../models/Season');
const Match = require('../models/Match');
const PlayerStat = require('../models/PlayerStat');
const MapGame = require('../models/MapGame');
const MapModel = require('../models/Map');
const { createExternalMatchInboxService } = require('../services/ExternalMatchInboxService');
const { createIncrementalMatchSyncService } = require('../services/IncrementalMatchSyncService');
const { createExternalMatchSyncClient } = require('../services/ExternalMatchSyncClient');

async function main() {
  await sequelize.authenticate();
  console.log(JSON.stringify((await sequelize.query('SELECT VERSION() version, DATABASE() db, CURRENT_USER() dbUser'))[0]));
  await initDatabase();
  let clock = new Date();
  const inbox = createExternalMatchInboxService({now: () => clock});
  const version = '2026-09-08T00:00:00.000001Z';
  const change = id => ({id, operation: 'upsert', updatedAt: version});
  const page = (items, nextCursor, hasMore = false) => ({schemaVersion: 3, items, nextCursor, hasMore});
  await assert.rejects(inbox.capture(page([change('atomic'), {id: 'invalid'}], 'bad'), null));
  assert.equal(await Inbox.count(), 0);
  assert.equal(await inbox.cursor(), null);
  await Config.create({key: 'external_match_sync_cursor_v2', value: {cursor: 'legacy'}});
  assert.equal(await inbox.cursor(), 'legacy');
  await inbox.capture(page([change('concurrent')], 'first'), 'legacy');
  assert.equal(await inbox.markApplied('first'), false);
  const candidate = (await inbox.pending())[0].get({plain: true});
  const apply = (row, transaction) => Config.create({key: 'written-once', value: {id: row.externalId}}, {transaction});
  const concurrent = await Promise.all([inbox.apply(candidate, apply), inbox.apply(candidate, apply)]);
  assert.equal(concurrent.filter(r => r.skipped).length, 1);
  assert.equal(await Config.count({where: {key: 'written-once'}}), 1);
  assert.equal(await inbox.markApplied('first'), true);
  assert.equal(await inbox.appliedCursor(), 'first');

  await inbox.capture(page([change('rollback')], 'second'), 'first');
  const rollback = (await inbox.pending())[0].get({plain: true});
  Inbox.addHook('beforeUpdate', 'reject-ack', row => {
    if (row.externalId === 'rollback' && row.status === 'applied') throw new Error('Injected acknowledgment failure');
  });
  const failed = await inbox.apply(rollback, (row, transaction) => Config.create({key: 'must-rollback', value: {}}, {transaction}));
  assert.match(failed.error.message, /acknowledgment/);
  assert.equal(await Config.findByPk('must-rollback'), null);
  assert.equal((await Inbox.findByPk('rollback')).attempts, 1);
  assert.equal(await inbox.appliedCursor(), 'first');
  Inbox.removeHook('beforeUpdate', 'reject-ack');
  clock = new Date(clock.getTime() + 31_000);
  await createExternalMatchInboxService({now: () => clock}).apply((await inbox.pending())[0], async () => ({}));
  assert.equal(await inbox.markApplied('second'), true);

  // Real source detail through the actual business writer, in the disposable database.
  const live = createExternalMatchSyncClient();
  const summary = await live.fetchChanges({limit: 20});
  const selected = summary.items.find(item => item.operation === 'upsert');
  assert.ok(selected, 'Need one representative live match');
  const detail = await live.fetchMatch(selected.id);
  await Season.create({name: detail.eventName, externalEventName: detail.eventName});
  const mapResponse = await fetch(process.env.OWCS_TEST_MAPS_URL || 'http://127.0.0.1:8081/api/maps');
  assert.equal(mapResponse.ok, true);
  const maps = await mapResponse.json();
  assert.ok(Array.isArray(maps));
  await MapModel.bulkCreate(maps.map(({name, type}) => ({name, type})));
  const details = {
    good: {...detail, id: 'good'},
    bad: {...detail, id: 'bad', eventName: 'verification-missing-season'}
  };
  let fixed = false;
  const client = {
    fetchChanges: async ({cursor}) => cursor === 'second'
      ? page(['bad', 'good'].map(id => ({...change(id), updatedAt: detail.updatedAt})), 'third')
      : page([], cursor),
    fetchMatch: async id => fixed ? {...detail, id} : details[id]
  };
  const service = () => createIncrementalMatchSyncService({client, inbox});
  const first = (await service().run()).data;
  console.log(JSON.stringify({phase: 'business-write', upserted: first.upsertedMatchesCount, errors: first.errors}));
  assert.equal(first.upsertedMatchesCount, 1);
  assert.equal(first.pendingCount, 1);
  assert.equal(await Match.count(), 1);
  assert.equal(await PlayerStat.count(), detail.rounds.reduce((sum, r) => sum + r.playersA.length + r.playersB.length, 0));
  assert.equal(await MapGame.count(), detail.rounds.length);
  fixed = true;
  clock = new Date(clock.getTime() + 31_000);
  const second = (await service().run()).data;
  assert.equal(second.pendingCount, 0);
  assert.equal(second.fullyApplied, true);
  assert.equal(await Match.count(), 2);
  console.log(JSON.stringify({ok: true, checks: ['atomic-capture', 'concurrent-apply', 'ack-rollback', 'restart-retry', 'cursor-upgrade', 'real-match-write'], sourceMatch: detail.id, mapsPerMatch: detail.rounds.length}));
}
main().catch(error => {console.error(error.stack); process.exitCode = 1;}).finally(() => sequelize.close());
