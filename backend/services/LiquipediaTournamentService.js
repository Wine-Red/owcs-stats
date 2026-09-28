const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { parseTournamentUrl } = require('./LiquipediaRosterParser');
const { bindTournament } = require('./TournamentMatchMatcher');
const { createTournamentSnapshotStore, sourceKey } = require('./TournamentSnapshotStore');
const { loadTournamentSnapshot, validSnapshot } = require('./TournamentSnapshotLoader');

function createTournamentService({ store = createTournamentSnapshotStore(), fetchPage, fetchCanonicalPages,
  legacyCacheDir = process.env.TOURNAMENT_CACHE_DIR || path.join(os.tmpdir(), 'owcs-tournament-cache'),
  now = Date.now, leaseMs = 10 * 60000, retryMs = 60000 } = {}) {
  const legacyChecked = new Set();
  const importLegacy = async source => {
    if (!legacyCacheDir || legacyChecked.has(source.page)) return;
    if ((await store.read(source.page))?.payload) { legacyChecked.add(source.page); return; }
    try {
      const snapshot = JSON.parse(await fs.readFile(path.join(legacyCacheDir, sourceKey(source.page) + '.json'), 'utf8'));
      if (validSnapshot(snapshot, source.page)) await store.seed(source, snapshot);
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    legacyChecked.add(source.page);
  };

  // Called only by the background worker. No SQL transaction spans API I/O.
  const sync = async (url, { intervalMs = 5 * 60000 } = {}) => {
    const source = parseTournamentUrl(url);
    await importLegacy(source);
    const claim = await store.claim(source, { now: now(), intervalMs, leaseMs });
    if (!claim) return { skipped: true };
    const heartbeat = setInterval(() => {
      store.renew(source.page, claim.syncToken, now() + leaseMs).catch(error => console.warn('[tournament-sync] lease renewal failed:', error.message));
    }, Math.min(60000, leaseMs / 3));
    heartbeat.unref?.();
    try {
      const snapshot = await loadTournamentSnapshot(source, { fetchPage, fetchCanonicalPages, now });
      const saved = await store.complete(source.page, claim.syncToken, snapshot, now() + intervalMs);
      return { saved, skipped: !saved };
    } catch (error) {
      const failureCount = claim.failureCount + 1;
      const delay = Math.min(60 * 60000, retryMs * 2 ** Math.min(failureCount - 1, 6));
      await store.fail(source.page, claim.syncToken, { failureCount, message: error.message, nextSyncAt: now() + delay });
      return { error: error.message };
    } finally { clearInterval(heartbeat); }
  };

  // Public reads never initiate upstream requests, file reads, or database writes.
  const get = async (url, catalog) => {
    if (!url) return { configured: false };
    const source = parseTournamentUrl(url);
    const row = await store.read(source.page);
    const refreshing = Boolean(row?.syncToken && new Date(row.leaseUntil).getTime() > now());
    const payload = row?.payload;
    if (!validSnapshot(payload, source.page)) return {
      configured: true, sourceUrl: source.url, loading: refreshing || !row?.lastError,
      unavailable: !refreshing && Boolean(row?.lastError), retryAfterMs: row?.lastError ? retryMs : 5000
    };
    const { scopeTournamentSnapshot } = await import('./tournamentSemantics.mjs');
    return { ...bindTournament(scopeTournamentSnapshot(payload), catalog), configured: true,
      stale: Boolean(row.nextSyncAt && new Date(row.nextSyncAt).getTime() <= now()),
      refreshing, syncError: Boolean(row.lastError), retryAfterMs: refreshing ? 5000 : 5 * 60000 };
  };
  const readSaved = async (page, options) => {
    const row = await store.read(page, options);
    return validSnapshot(row?.payload, page) ? row.payload : null;
  };
  return { get, sync, readSaved, prepare: url => importLegacy(parseTournamentUrl(url)) };
}

module.exports = { createTournamentService };
