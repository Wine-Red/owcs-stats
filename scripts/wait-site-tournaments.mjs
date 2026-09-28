// A new backend can be healthy while its first source snapshots are still queued.
// Only read the public API; synchronization belongs to the background worker.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

const config = JSON.parse(await readFile(process.env.OWCS_SITE_CONFIG || 'site-package.config.json', 'utf8'));
const timeoutMs = Number(process.env.OWCS_TOURNAMENT_READY_TIMEOUT_MS || 1200000);
assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 1200000);
const deadline = Date.now() + timeoutMs;
const get = async route => {
  const response = await fetch(`${config.apiBaseUrl}${route}`, {
    cache: 'no-store', signal: AbortSignal.timeout(Math.max(1, Math.min(30000, deadline - Date.now())))
  });
  assert.equal(response.status, 200, `Tournament readiness: ${route} returned ${response.status}`);
  return response.json();
};
const seasons = await get('/seasons');
assert.ok(Array.isArray(seasons) && seasons.length, 'No seasons available for export');
let pending = seasons, ready = 0, unconfigured = 0;
while (pending.length) {
  const waiting = [];
  for (const season of pending) {
    const value = await get(`/seasons/${season.id}/tournament`);
    assert.equal(typeof value.configured, 'boolean', `Invalid tournament response for season ${season.id}`);
    if (!value.configured) unconfigured++;
    else if (Array.isArray(value.blocks) && value.blocks.length) ready++;
    else waiting.push(season);
  }
  pending = waiting;
  console.log(`[tournament-ready] ${ready} ready, ${unconfigured} without source, ${pending.length} waiting${pending.length ? ': ' + pending.map(s => `${s.id} ${s.name}`).join(', ') : ''}`);
  if (!pending.length) break;
  if (Date.now() >= deadline) throw new Error('Configured tournaments still have no complete snapshot; refusing to export an incomplete release');
  await setTimeout(Math.min(30000, deadline - Date.now()));
}
