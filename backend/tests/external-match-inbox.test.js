const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { createExternalMatchInboxService } = require('../services/ExternalMatchInboxService');
const { createIncrementalMatchSyncService } = require('../services/IncrementalMatchSyncService');

// Transaction-aware ORM substitute: both match writes and inbox/cursor writes roll back.
function harness() {
  let state = {inbox: new Map(), config: new Map(), matches: new Map()};
  let clock = new Date('2026-09-08T00:00:00Z');
  let serial = Promise.resolve();
  let failCursor = false;
  let failApplied = false;
  const database = {transaction: fn => {
    const run = serial.then(async () => {
      const transaction = {state: structuredClone(state), LOCK: {UPDATE: 'UPDATE'}};
      const result = await fn(transaction);
      state = transaction.state;
      return result;
    });
    serial = run.catch(() => {});
    return run;
  }};
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object') {
      if (Op.lte in value) return row[key] <= value[Op.lte];
      if (Op.gt in value) return row[key] > value[Op.gt];
    }
    return row[key] === value;
  });
  const model = (table, key) => {
    const wrap = data => ({...structuredClone(data),
      get: () => structuredClone(data),
      update: async (patch, {transaction}) => {
        if (table === 'config' && failCursor) throw new Error('cursor storage unavailable');
        if (table === 'inbox' && patch.status === 'applied' && failApplied) throw new Error('inbox acknowledgment failed');
        Object.assign(transaction.state[table].get(data[key]), structuredClone(patch));
      }
    });
    return {
      findByPk: async (id, options = {}) => {
        const data = (options.transaction?.state || state)[table].get(id);
        return data ? wrap(data) : null;
      },
      findOrCreate: async ({where, defaults, transaction}) => {
        const values = transaction.state[table];
        const id = where[key];
        const created = !values.has(id);
        if (created) values.set(id, {status: 'pending', attempts: 0, lastError: null, ...defaults, ...where});
        return [wrap(values.get(id)), created];
      },
      findAll: async ({where, limit = Infinity, raw = false}) => [...state[table].values()]
        .filter(row => matches(row, where)).sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)
        .slice(0, limit).map(row => raw ? structuredClone(row) : wrap(row)),
      findOne: async ({where, transaction}) => {
        const row = [...(transaction?.state || state)[table].values()].find(row => matches(row, where));
        return row ? wrap(row) : null;
      },
      count: async ({where, transaction}) => [...(transaction?.state || state)[table].values()].filter(row => matches(row, where)).length
    };
  };
  const options = {database, inbox: model('inbox', 'externalId'), config: model('config', 'key'), now: () => new Date(clock)};
  const inbox = createExternalMatchInboxService(options);
  const applied = [];
  const applyChange = async (row, detail, transaction) => {
    if (row.operation === 'delete') transaction.state.matches.delete(row.externalId);
    else transaction.state.matches.set(row.externalId, detail);
    if (detail?.badData) throw new Error('Season not found');
    applied.push(row.externalId);
    return {created: true, deleted: true, seasonId: 1};
  };
  let orphanCalls = 0;
  const service = client => createIncrementalMatchSyncService({client, inbox, applyChange,
    saveSummary: async () => {}, reconcileOrphans: async () => {
      orphanCalls++;
      return {marked: [], restored: [], deleted: [], protectedLegacyOrManual: []};
    }});
  return {inbox, options, service, applyChange, applied, database,
    get state() {return state;}, get orphanCalls() {return orphanCalls;},
    advance: ms => {clock = new Date(clock.getTime() + ms);},
    failCursor: value => {failCursor = value;}, failApplied: value => {failApplied = value;}};
}
const v1 = '2026-09-08T00:00:00.000001Z';
const v2 = '2026-09-08T00:00:00.000002Z';
const v3 = '2026-09-08T00:00:00.000003Z';
const change = (id, updatedAt = v1, operation = 'upsert') => ({id, updatedAt, operation});
const page = (items, nextCursor, hasMore = false) => ({schemaVersion: 3, items, nextCursor, hasMore});
const noOrphans = {marked: [], restored: [], deleted: [], protectedLegacyOrManual: []};

test('bad match cannot block its page or later pages, and retry survives service restart', async () => {
  const h = harness();
  let failing = true;
  const cursors = [];
  const client = {
    fetchChanges: async ({cursor}) => {
      cursors.push(cursor);
      if (!cursor) return page([change('bad'), change('good')], 'p1', true);
      if (cursor === 'p1') return page([change('later')], 'p2');
      return page([], cursor);
    },
    fetchMatch: async id => {
      if (id === 'bad' && failing) throw new Error('temporary upstream error');
      return {id, updatedAt: v1};
    }
  };
  const first = (await h.service(client).run()).data;
  assert.deepEqual(cursors, [null, 'p1']);
  assert.equal(first.newMatchesCount, 2);
  assert.equal(first.pendingCount, 1);
  assert.equal(first.failedCount, 1);
  assert.equal(first.capturedThrough, 'p2');
  assert.equal(first.appliedThrough, null);
  assert.equal(first.fullyApplied, false);
  assert.equal(h.orphanCalls, 0);
  assert.deepEqual([...h.state.matches.keys()], ['good', 'later']);
  // Not due yet: do not retry immediately or claim completion.
  assert.equal((await h.service(client).run()).data.pendingCount, 1);
  assert.equal(h.state.inbox.get('bad').attempts, 1);
  failing = false;
  h.advance(31_000);
  const restartedInbox = createExternalMatchInboxService(h.options);
  const restarted = createIncrementalMatchSyncService({client, inbox: restartedInbox, applyChange: h.applyChange,
    saveSummary: async () => {}, reconcileOrphans: async () => noOrphans});
  const second = (await restarted.run()).data;
  assert.equal(second.newMatchesCount, 1);
  assert.equal(second.pendingCount, 0);
  assert.equal(second.appliedThrough, 'p2');
  assert.equal(h.applied.filter(id => id === 'good').length, 1);
});

test('cursor and all inbox changes are committed together', async () => {
  const h = harness();
  h.failCursor(true);
  await assert.rejects(h.inbox.capture(page([change('one'), change('two')], 'next'), null), /cursor storage/);
  assert.equal(h.state.inbox.size, 0);
  assert.equal(await h.inbox.cursor(), null);
  h.failCursor(false);
  assert.equal(await h.inbox.capture(page([change('one')], 'next'), null), true);
  assert.equal(await h.inbox.capture(page([change('obsolete', v1)], 'old'), null), false);
  assert.equal(h.state.inbox.has('obsolete'), false);
});

test('upgrade starts at the legacy applied cursor and rollback cannot skip pending work', async () => {
  const h = harness();
  h.state.config.set('external_match_sync_cursor_v2', {key: 'external_match_sync_cursor_v2', value: {cursor: 'legacy'}});
  assert.equal(await h.inbox.cursor(), 'legacy');
  await h.inbox.capture(page([change('pending')], 'captured'), 'legacy');
  assert.equal(await h.inbox.cursor(), 'captured');
  assert.equal(await h.inbox.appliedCursor(), 'legacy');
  assert.equal(await h.inbox.markApplied('captured'), false);
  await h.inbox.apply((await h.inbox.pending())[0], async () => ({}));
  assert.equal(await h.inbox.markApplied('outdated'), false);
  assert.equal(await h.inbox.markApplied('captured'), true);
  assert.equal(await h.inbox.appliedCursor(), 'captured');
});

test('mutation failure rolls back the match and persists independent retry metadata', async () => {
  const h = harness();
  const result = await h.service({fetchChanges: async () => page([change('bad'), change('good')], 'p1'),
    fetchMatch: async id => ({id, updatedAt: v1, badData: id === 'bad'})}).run();
  assert.equal(h.state.matches.has('bad'), false);
  assert.equal(h.state.matches.has('good'), true);
  assert.equal(h.state.inbox.get('bad').attempts, 1);
  assert.equal(result.data.newMatchesCount, 1);
});

test('lost acknowledgment rolls back both match and inbox, allowing safe retry', async () => {
  const h = harness();
  await h.inbox.capture(page([change('one')], 'p1'), null);
  const candidate = (await h.inbox.pending())[0];
  h.failApplied(true);
  const failed = await h.inbox.apply(candidate, (row, tx) => h.applyChange(row, {id: 'one'}, tx));
  assert.match(failed.error.message, /acknowledgment/);
  assert.equal(h.state.matches.size, 0);
  assert.equal(h.state.inbox.get('one').status, 'pending');
  h.failApplied(false);
  h.advance(31_000);
  assert.ok((await h.inbox.apply((await h.inbox.pending())[0], (row, tx) => h.applyChange(row, {id: 'one'}, tx))).result);
});

test('newer delete or recreation supersedes a failed/stale attempt for the same match', async () => {
  const h = harness();
  await h.inbox.capture(page([change('one')], 'p1'), null);
  const old = (await h.inbox.pending())[0];
  await h.inbox.capture(page([change('one', v2, 'delete')], 'p2'), 'p1');
  const deletion = (await h.inbox.pending())[0];
  await h.inbox.capture(page([change('one', v3)], 'p3'), 'p2');
  const shouldNotRun = () => {throw new Error('obsolete operation executed');};
  assert.equal((await h.inbox.apply(old, shouldNotRun)).skipped, true);
  assert.equal((await h.inbox.apply(deletion, shouldNotRun)).skipped, true);
  assert.equal(h.state.inbox.get('one').sourceUpdatedAt, v3);
  await h.inbox.enqueueOne(change('one', v1), true);
  assert.equal(h.state.inbox.get('one').sourceUpdatedAt, v3);
});

test('pending work proceeds during feed outage and completion is not overstated', async () => {
  const h = harness();
  await h.inbox.capture(page([change('one')], 'p1'), null);
  const result = (await h.service({fetchChanges: async () => {throw new Error('feed offline');},
    fetchMatch: async id => ({id, updatedAt: v1})}).run()).data;
  assert.equal(result.newMatchesCount, 1);
  assert.equal(result.captureError, 'feed offline');
  assert.equal(result.fullyApplied, false);
  assert.equal(h.orphanCalls, 0);
});

test('live detail newer than queued deletion restores the current source state', async () => {
  const h = harness();
  const result = (await h.service({fetchChanges: async () => page([change('one', v2, 'delete')], 'p1'),
    fetchMatch: async id => ({id, updatedAt: v3})}).run()).data;
  assert.equal(result.deletedMatchesCount, 0);
  assert.equal(h.state.matches.get('one').updatedAt, v3);
});

test('only a source 404 confirms deletion; other failures remain retryable', async () => {
  const h = harness();
  const result = (await h.service({fetchChanges: async () => page([change('gone', v2, 'delete'), change('unknown', v2, 'delete')], 'p1'),
    fetchMatch: async id => {const error = new Error(id); error.statusCode = id === 'gone' ? 404 : 503; throw error;}}).run()).data;
  assert.equal(result.deletedMatchesCount, 1);
  assert.equal(result.pendingCount, 1);
});

test('a concurrent newer capture cannot be acknowledged with older live detail', async () => {
  const h = harness();
  const result = (await h.service({
    fetchChanges: async () => page([change('one')], 'p1'),
    fetchMatch: async () => {
      await h.inbox.enqueueOne(change('one', v3));
      return {id: 'one', updatedAt: v2};
    }
  }).run()).data;
  assert.equal(h.state.matches.has('one'), false);
  assert.equal(h.state.inbox.get('one').sourceUpdatedAt, v3);
  assert.equal(h.state.inbox.get('one').status, 'pending');
  assert.equal(result.pendingCount, 1);
});
