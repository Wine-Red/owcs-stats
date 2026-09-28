// Local preview: public business data stays read-only. Only tournament snapshots
// are persisted in a loopback MySQL database; never starts business-data sync jobs.
const express = require('express');
const https = require('https');
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { createTournamentService } = require('../services/LiquipediaTournamentService');
const { createTournamentScheduler } = require('../services/TournamentSyncScheduler');
const { fetchParsedHtml } = require('../services/LiquipediaClient');
const { resolveTournamentSource, resolveTournamentSeasonIds } = require('../services/TournamentSourceResolver');
const { serializeTeamLiquipedia, teamLiquipediaPayload, assertTeamLiquipediaAvailable } = require('../services/TeamLiquipediaLink');
const args = process.argv.slice(2);
const arg = key => args[args.indexOf(key) + 1];
const port = args.includes('--port') ? Number(arg('--port')) : 3012;
const overrides = Object.fromEntries(args.flatMap((value, i) => value === '--source' ? [args[i + 1].split(/=(.*)/s).slice(0, 2)] : []));
const sourceDir = args.includes('--source-cache') ? path.resolve(arg('--source-cache')) : null;
const teamLinksFile = args.includes('--team-links') ? path.resolve(arg('--team-links')) : null;
let teamLinks = [];
const upstream = 'https://stats.owmini.xyz/public-api/site/v1';
const publicGet = url => new Promise((resolve, reject) => {
  https.get(url, { family: 4, timeout: 45000 }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve({ status: response.statusCode, contentType: response.headers['content-type'], body: Buffer.concat(chunks) }));
    response.on('error', reject);
  }).on('error', reject).on('timeout', function () { this.destroy(new Error('Public API timed out')); });
});
const requests = new Map();
const read = async route => {
  const previous = requests.get(route);
  if (previous && Date.now() - previous.at < 60000) return previous.promise;
  const promise = publicGet(`${upstream}${route}`);
  requests.set(route, { promise, at: Date.now() });
  const response = await promise;
  if (response.status >= 400) requests.delete(route);
  return response;
};
const json = async route => {
  const response = await read(route);
  if (response.status !== 200) throw new Error(`Public API ${response.status}: ${route}`);
  return JSON.parse(response.body.toString('utf8'));
};
const readTeams = async () => {
  const teams = (await json('/teams')).map(serializeTeamLiquipedia);
  for (const entry of teamLinks) {
    const team = teams.find(t => Number(t.id) === entry.teamId && t.name === entry.name);
    if (!team) throw new Error(`Local team link identity changed: ${entry.teamId}`);
    const payload = teamLiquipediaPayload({ liquipediaUrls: entry.liquipediaUrls }, team);
    assertTeamLiquipediaAvailable(payload.liquipediaUrls, teams, team.id);
    Object.assign(team, payload);
  }
  return teams;
};
const sourceFiles = new Map();
if (!['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST)) throw new Error('Tournament preview requires a loopback MySQL database');
const database = require('../config/database');
database.options.logging = false;
const TournamentSnapshot = require('../models/TournamentSnapshot');
const service = createTournamentService({
  legacyCacheDir: path.resolve('.local/tournament-preview-cache'),
  fetchPage: async ({ page }) => {
    // Recently captured real API responses may seed the local cold start. Expired
    // responses are fetched live, so the preview exercises automatic refresh.
    const cached = sourceFiles.get(page.replace(/_/g, ' '));
    if (cached && Date.now() - cached.at < 5 * 60000) return cached.data;
    const result = await fetchParsedHtml({ page });
    if (sourceDir && result.html) {
      const file = path.join(sourceDir, `${require('crypto').createHash('sha256').update(page).digest('hex')}.json`);
      await fs.writeFile(file, JSON.stringify({ ...result, page }));
    }
    console.log('Tournament source read:', page, result.html.length);
    return result;
  }
});
const readCatalog = async () => {
  const response = await json('/seasons');
  const seasons = Array.isArray(response) ? response : response.list || response.data || [];
  const configs = await Promise.all(seasons.map(async season => {
    const value = await json(`/config/visualize_season_${season.id}`);
    return { key: `visualize_season_${season.id}`, value: { ...value,
      ...(overrides[season.id] ? { liquipediaTournamentUrl: overrides[season.id] } : {}) } };
  }));
  return { seasons, configs };
};
const scheduler = createTournamentScheduler({ service, readCatalog });
const app = express();
app.use((req, res, next) => req.method === 'GET' ? next() : res.status(405).json({ error: 'Local read-only preview' }));
app.get(['/api/seasons', '/api/seasons/:id'], async (req, res) => {
  try {
    const { presentSeason } = await import('../shared/seasonStatus.mjs');
    const { seasons, configs } = await readCatalog();
    const dates = new Map(configs.map(config => [config.key, config.value?.dateRange]));
    const now = Date.now();
    const rows = seasons.map(season => presentSeason(season, dates.get(`visualize_season_${season.id}`), now));
    if (!req.params.id) return res.json(rows);
    const season = rows.find(row => String(row.id) === req.params.id);
    return season ? res.json(season) : res.status(404).json({ error: 'Season not found' });
  } catch (error) { return res.status(502).json({ error: error.message }); }
});
app.get(['/api/teams', '/api/teams/:id'], async (req, res) => {
  try {
    const teams = await readTeams();
    if (!req.params.id) return res.json(teams);
    const team = teams.find(t => Number(t.id) === Number(req.params.id));
    return team ? res.json(team) : res.status(404).json({ error: 'Team not found' });
  } catch (error) { res.status(502).json({ error: error.message }); }
});
app.get('/api/seasons/:seasonId/tournament', async (req, res) => {
  try {
    const id = Number(req.params.seasonId);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid season' });
    const [catalog, teams, seasonTeams] = await Promise.all([readCatalog(), readTeams(), json(`/seasons/${id}/teams`)]);
    const season = catalog.seasons.find(season => Number(season.id) === id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    const config = catalog.configs.find(config => config.key === `visualize_season_${id}`)?.value;
    const sourceUrl = resolveTournamentSource(season, config);
    if (!sourceUrl) return res.json({ configured: false, seasonId: id, localPreview: true });
    const matchSeasonIds = [...new Set([id, ...resolveTournamentSeasonIds(sourceUrl, catalog.seasons, catalog.configs)])];
    const matchResponses = await Promise.all(matchSeasonIds.map(seasonId => json(`/matches?seasonId=${seasonId}&pageSize=10000`)));
    const members = new Set(seasonTeams.map(t => Number(t.id)));
    const matches = matchResponses.flatMap(response => Array.isArray(response) ? response : response.list || response.matches || response.data || []);
    res.json({ ...await service.get(sourceUrl, {
      allTeams: teams, teams: teams.filter(t => members.has(Number(t.id))), matches, seasonId: id, matchSeasonIds
    }), seasonId: id, localPreview: true });
  } catch (error) { res.status(502).json({ error: error.message }); }
});
app.use(async (req, res) => {
  try {
    if (req.path.startsWith('/media/')) {
      const response = await publicGet(`https://stats.owmini.xyz${req.originalUrl}`);
      return res.status(response.status).type(response.contentType || 'application/octet-stream').send(response.body);
    }
    if (!req.path.startsWith('/api/')) return res.status(404).end();
    const response = await read(req.originalUrl.slice(4));
    return res.status(response.status).type(response.contentType || 'application/json').send(response.body);
  } catch (error) { res.status(502).json({ error: error.message }); }
});
(async () => {
  if (teamLinksFile) {
    teamLinks = JSON.parse(await fs.readFile(teamLinksFile, 'utf8'));
    if (!Array.isArray(teamLinks)) throw new Error('Local team links must be a list');
    await readTeams(); // Validate local overrides before starting the server.
  }
  // Deliberately sync only the new table. Never call initDatabase/sequelize.sync here.
  await database.authenticate();
  await TournamentSnapshot.sync();
  if (sourceDir) for (const name of await fs.readdir(sourceDir)) {
    if (!name.endsWith('.json') || name.endsWith('.parsed.json')) continue;
    const file = path.join(sourceDir, name);
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (data.page && data.html) sourceFiles.set(data.page.replace(/_/g, ' '), { data, at: (await fs.stat(file)).mtimeMs });
  }
  const server = app.listen(port, '127.0.0.1');
  server.on('listening', () => { console.log(`DB-backed tournament preview: http://127.0.0.1:${port}`); scheduler.start(); });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  const close = () => server.close(async () => { await scheduler.stop(); await database.close(); });
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
