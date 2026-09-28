const { resolveTournamentSource } = require('./TournamentSourceResolver');
const { parseTournamentUrl } = require('./LiquipediaRosterParser');

const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const configValue = value => typeof value === 'string' ? JSON.parse(value) : value || {};

function syncInterval(season, config, now) {
  const dates = [...String(config.dateRange || '').matchAll(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g)]
    .map(m => Date.parse(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00+08:00`));
  if (dates.length === 2 && dates.every(Number.isFinite) && dates[1] >= dates[0]) {
    if (now < dates[0]) return HOUR;
    const end = dates[1] + DAY;
    if (now < end) return 5 * MINUTE;
    return now - end < 7 * DAY ? HOUR : DAY;
  }
  return season.status === 'completed' ? DAY : 5 * MINUTE;
}

function planTournamentSync(seasons, configs, now) {
  const values = new Map(configs.map(c => [c.key, c.value]));
  const sources = new Map(), errors = [];
  for (const season of seasons) {
    try {
      const config = configValue(values.get(`visualize_season_${season.id}`));
      const url = resolveTournamentSource(season, config);
      if (!url) continue;
      const source = parseTournamentUrl(url), intervalMs = syncInterval(season, config, now);
      const existing = sources.get(source.page);
      if (existing) { existing.intervalMs = Math.min(existing.intervalMs, intervalMs); existing.seasonIds.push(season.id); }
      else sources.set(source.page, { ...source, intervalMs, seasonIds: [season.id] });
    } catch (error) { errors.push({ seasonId: season.id, message: error.message }); }
  }
  return { sources: [...sources.values()].sort((a, b) => a.intervalMs - b.intervalMs), errors };
}

function createTournamentScheduler({ service, readCatalog, now = Date.now, tickMs = MINUTE, logger = console }) {
  let timer, running, started = false, wakePending = false, generation = 0;
  const arm = delay => {
    clearTimeout(timer);
    timer = setTimeout(() => runOnce().catch(error => logger.error('[tournament-sync]', error.message)), delay);
    timer.unref?.();
  };
  const runOnce = () => {
    if (running) return running;
    const token = generation;
    running = (async () => {
      const { seasons, configs } = await readCatalog();
      const plan = planTournamentSync(seasons, configs, now());
      const report = { checked: 0, saved: 0, skipped: 0, errors: [...plan.errors] };
      // Restore all existing file snapshots before any slow upstream reads.
      for (const source of plan.sources) {
        if (token !== generation) break;
        try { await service.prepare?.(source.url); }
        catch (error) { report.errors.push({ page: source.page, message: error.message }); }
      }
      for (const source of plan.sources) {
        if (token !== generation) break;
        try {
          const result = await service.sync(source.url, { intervalMs: source.intervalMs });
          report.checked++;
          if (result.saved) report.saved++;
          if (result.skipped) report.skipped++;
          if (result.error) report.errors.push({ page: source.page, message: result.error });
        } catch (error) { report.errors.push({ page: source.page, message: error.message }); }
        if (wakePending) break; // Pick up newly saved configuration after the current source finishes.
      }
      if (report.saved || report.errors.length) logger.info('[tournament-sync]', JSON.stringify(report));
      return report;
    })().finally(() => {
      running = null;
      if (started) arm(wakePending ? 0 : tickMs);
      wakePending = false;
    });
    return running;
  };
  return {
    runOnce,
    start() { if (!started) { started = true; arm(0); } },
    wake() { if (started) { if (running) wakePending = true; else arm(0); } },
    stop() { started = false; generation++; clearTimeout(timer); return running || Promise.resolve(); }
  };
}

module.exports = { createTournamentScheduler, planTournamentSync, syncInterval };
