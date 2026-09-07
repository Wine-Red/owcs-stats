const { randomUUID, createHash } = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Season = require('../models/Season');
const Config = require('../models/Config');
const Team = require('../models/Team');
const Player = require('../models/Player');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const client = require('./LiquipediaClient');
const membership = require('./MembershipSourceService');
const { parseTournamentUrl, parseRosterHtml } = require('./LiquipediaRosterParser');
const { matchRoster } = require('./LiquipediaRosterMatcher');

const CACHE_MS = 5 * 60 * 1000;
const PREVIEW_MS = 15 * 60 * 1000;
const pageCache = new Map();
const previews = new Map();
let fetchingPage = null;
const error = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const trimCache = (cache, max) => {
  for (const [key, item] of cache) if (item.expiresAt <= Date.now()) cache.delete(key);
  while (cache.size >= max) cache.delete(cache.keys().next().value);
};

const getSource = async (seasonId, transaction) => {
  const options = { transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) };
  const season = await Season.findByPk(seasonId, options);
  if (!season) throw error('赛季不存在', 404);
  const config = await Config.findByPk(`visualize_season_${seasonId}`, options);
  const value = typeof config?.value === 'string' ? JSON.parse(config.value) : config?.value;
  return { seasonName: season.name, ...parseTournamentUrl(value?.liquipediaTournamentUrl) };
};

const loadCatalog = async (seasonId, transaction) => {
  const options = { transaction, raw: true, ...(transaction ? { lock: transaction.LOCK.SHARE } : {}) };
  const [teams, players, seasonTeams] = await Promise.all([
    Team.findAll({ ...options, attributes: ['id', 'name'] }),
    Player.findAll({ ...options, attributes: ['id', 'name', 'role'] }),
    SeasonTeam.findAll({ ...options, where: { seasonId }, attributes: ['id', 'teamId'] })
  ]);
  const seasonPlayers = seasonTeams.length ? await SeasonTeamPlayer.findAll({
    ...options, where: { seasonTeamId: { [Op.in]: seasonTeams.map(row => row.id) } },
    attributes: ['seasonTeamId', 'playerId']
  }) : [];
  return { teams, players, seasonTeams, seasonPlayers };
};

const fetchRoster = async source => {
  const cached = pageCache.get(source.page);
  if (cached?.expiresAt > Date.now()) return cached;
  if (fetchingPage) {
    if (fetchingPage.page === source.page) return fetchingPage.promise;
    throw error('正在读取另一个 Liquipedia 赛事，请稍后重试', 429);
  }
  const promise = (async () => {
    let parsed;
    try { parsed = await client.fetchParsedHtml({ page: source.page }); }
    catch { throw error('Liquipedia 暂时无法访问，请稍后重试；未写入任何关联', 502); }
    const roster = parseRosterHtml(parsed.html);
    const item = { roster, revisionId: parsed.revisionId, fetchedAt: new Date().toISOString(), expiresAt: Date.now() + CACHE_MS };
    trimCache(pageCache, 20);
    pageCache.set(source.page, item);
    return item;
  })();
  fetchingPage = { page: source.page, promise };
  try { return await promise; } finally { fetchingPage = null; }
};

// Ignore additive existence changes so a retry after a lost response remains
// idempotent. Changes to identities, conflicts or decisions require a new preview.
const decisionHash = report => createHash('sha256').update(JSON.stringify(report.teams.map(team => ({
  link: team.link, teamId: team.teamId, name: team.matchedName, status: team.status, reason: team.reason,
  players: team.players.map(player => ({ link: player.link, playerId: player.playerId, name: player.matchedName, status: player.status, reason: player.reason }))
})))).digest('hex');

const preview = async seasonId => {
  const source = await getSource(seasonId);
  const snapshot = await fetchRoster(source);
  const report = matchRoster(snapshot.roster, await loadCatalog(seasonId));
  const previewToken = randomUUID();
  const expiresAt = Date.now() + PREVIEW_MS;
  trimCache(previews, 100);
  previews.set(previewToken, { seasonId, source, snapshot, hash: decisionHash(report), expiresAt });
  return { ...report, seasonId, seasonName: source.seasonName, sourceUrl: source.url,
    revisionId: snapshot.revisionId, fetchedAt: snapshot.fetchedAt, previewToken, expiresAt: new Date(expiresAt).toISOString() };
};

const apply = async (seasonId, previewToken, excludedTeamLinks = [], excludedPlayers = []) => {
  const saved = typeof previewToken === 'string' ? previews.get(previewToken) : null;
  if (!saved || saved.seasonId !== seasonId || saved.expiresAt <= Date.now()) {
    throw error('匹配预览已过期或不属于当前赛季，请重新预览', 409);
  }
  const sourceLinks = new Set(saved.snapshot.roster.teams.map(team => team.link));
  if (!Array.isArray(excludedTeamLinks) || excludedTeamLinks.some(link => typeof link !== 'string' || !sourceLinks.has(link))) {
    throw error('排除的队伍不属于当前预览，请重新预览', 400);
  }
  const excluded = new Set(excludedTeamLinks);
  const playerKey = (team, player) => JSON.stringify([team.link, player.link, player.name]);
  const sourcePlayers = new Set(saved.snapshot.roster.teams.flatMap(team => team.players.map(player => playerKey(team, player))));
  if (!Array.isArray(excludedPlayers) || excludedPlayers.some(key => typeof key !== 'string' || !sourcePlayers.has(key))) {
    throw error('排除的选手不属于当前预览，请重新预览', 400);
  }
  const excludedPlayerSet = new Set(excludedPlayers);
  return sequelize.transaction(async transaction => {
    // Serialize applies for the same season, then re-read identity and conflict
    // evidence inside the transaction. The browser cannot supply arbitrary IDs.
    const source = await getSource(seasonId, transaction);
    if (source.url !== saved.source.url) throw error('赛季 Liquipedia 页面已更改，请重新预览', 409);
    const report = matchRoster(saved.snapshot.roster, await loadCatalog(seasonId, transaction));
    if (decisionHash(report) !== saved.hash) throw error('数据库身份或赛季关联已变化，请重新预览后再应用', 409);
    report.teams = report.teams.filter(team => !excluded.has(team.link));
    for (const team of report.teams) team.players = team.players.filter(player => !excludedPlayerSet.has(playerKey(team, player)));
    const players = report.teams.flatMap(team => team.players);
    report.summary = {
      totalTeams: report.teams.length, matchedTeams: report.teams.filter(team => team.status === 'matched').length,
      newTeams: report.teams.filter(team => team.status === 'matched' && !team.existing).length,
      skippedTeams: report.teams.filter(team => team.status === 'skipped').length,
      totalPlayers: players.length, matchedPlayers: players.filter(player => player.status === 'matched').length,
      newPlayers: players.filter(player => player.status === 'matched' && !player.existing).length,
      skippedPlayers: players.filter(player => player.status === 'skipped').length
    };
    const counts = { createdTeams: 0, createdPlayers: 0, addedTeamSources: 0, addedPlayerSources: 0 };
    const sourceKey = `page:${createHash('sha256').update(source.url).digest('hex')}`;
    for (const row of report.teams) {
      if (row.status !== 'matched') continue;
      const ensured = await membership.ensureSeasonTeam({ seasonId, teamId: row.teamId,
        sourceType: membership.SOURCE_TYPES.LIQUIPEDIA, sourceKey, transaction });
      counts.createdTeams += Number(ensured.relationCreated);
      counts.addedTeamSources += Number(ensured.sourceCreated);
      for (const player of row.players) {
        if (player.status !== 'matched') continue;
        const result = await membership.ensureSeasonTeamPlayer({ seasonTeam: ensured.seasonTeam, playerId: player.playerId,
          sourceType: membership.SOURCE_TYPES.LIQUIPEDIA, sourceKey, transaction });
        counts.createdPlayers += Number(result.relationCreated);
        counts.addedPlayerSources += Number(result.sourceCreated);
      }
    }
    return { ...report, ...counts, excludedTeams: excluded.size, seasonId, sourceUrl: source.url, revisionId: saved.snapshot.revisionId,
      message: `已新增 ${counts.createdTeams} 条队伍关联、${counts.createdPlayers} 条选手关联；排除 ${excluded.size} 支队伍；跳过 ${report.summary.skippedTeams} 支队伍、${report.summary.skippedPlayers} 条选手记录` };
  });
};

module.exports = { preview, apply, decisionHash };
