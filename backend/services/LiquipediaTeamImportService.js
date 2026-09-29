const { createHash, randomUUID } = require('node:crypto');
const { identityTransaction } = require('./IdentityWriteService');
const { resolveTournamentSource } = require('./TournamentSourceResolver');
const { parseTournamentUrl, parseParticipantTeamsHtml } = require('./LiquipediaRosterParser');
const { getTeamLiquipediaUrls } = require('./TeamLiquipediaLink');
const { matchTeamsByPage } = require('./LiquipediaTeamMatcher');
const client = require('./LiquipediaClient');
const membership = require('./MembershipSourceService');
const Season = require('../models/Season');
const Config = require('../models/Config');
const Team = require('../models/Team');
const SeasonTeam = require('../models/SeasonTeam');

const PAGE_CACHE_MS = 5 * 60 * 1000;
const PREVIEW_MS = 15 * 60 * 1000;
const pageCache = new Map(), previews = new Map();
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const hash = value => createHash('sha256').update(value).digest('hex');
const trim = (cache, limit) => {
  for (const [key, value] of cache) if (value.expiresAt <= Date.now()) cache.delete(key);
  while (cache.size >= limit) cache.delete(cache.keys().next().value);
};

const getSource = async (seasonId, transaction) => {
  const options = { transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) };
  const season = await Season.findByPk(seasonId, options);
  if (!season) throw fail('赛季不存在', 404);
  const config = await Config.findByPk(`visualize_season_${seasonId}`, options);
  const value = typeof config?.value === 'string' ? JSON.parse(config.value) : config?.value;
  const url = resolveTournamentSource(season, value);
  if (!url) throw fail('该赛季没有可用的 Liquipedia 赛事页面，请先在赛季可视化配置中设置', 400);
  return { seasonName: season.name, configuredUrl: value?.liquipediaTournamentUrl || '', ...parseTournamentUrl(url) };
};
const loadCatalog = async (seasonId, transaction) => {
  const [teams, seasonTeams] = await Promise.all([
    Team.findAll({ transaction, raw: true, order: [['id', 'ASC']] }),
    SeasonTeam.findAll({ where: { seasonId }, transaction, raw: true })
  ]);
  return { teams, seasonTeams };
};
const fetchParticipants = async source => {
  const cached = pageCache.get(source.page);
  if (cached?.expiresAt > Date.now()) return cached;
  let parsed;
  try { parsed = await client.fetchParsedHtml({ page: source.page }); }
  catch { throw fail('Liquipedia 暂时无法访问，请稍后重试；未写入队伍关联', 502); }
  const participants = parseParticipantTeamsHtml(parsed.html);
  const entry = { ...participants, revisionId: parsed.revisionId, fetchedAt: new Date().toISOString(), expiresAt: Date.now() + PAGE_CACHE_MS };
  trim(pageCache, 20);
  pageCache.set(source.page, entry);
  return entry;
};
const decisionHash = report => hash(JSON.stringify(report.teams.map(team => ({
  canonicalPage: team.canonicalPage, teamId: team.teamId, status: team.status, reason: team.reason
}))));

const preview = async seasonId => {
  const source = await getSource(seasonId);
  const [participants, catalog] = await Promise.all([fetchParticipants(source), loadCatalog(seasonId)]);
  const titles = [...new Set([
    ...participants.teams.map(team => parseTournamentUrl(team.link).page),
    ...catalog.teams.flatMap(team => getTeamLiquipediaUrls(team).map(url => parseTournamentUrl(url).page))
  ])];
  let redirects;
  try { redirects = await client.fetchCanonicalPages(titles); }
  catch { throw fail('Liquipedia 队伍页面重定向暂时无法核验，请稍后重试；未写入队伍关联', 502); }
  const report = matchTeamsByPage({ sourceTeams: participants.teams, ...catalog, redirects });
  const previewToken = randomUUID(), expiresAt = Date.now() + PREVIEW_MS;
  trim(previews, 100);
  previews.set(previewToken, { seasonId, source, participants, redirects, hash: decisionHash(report), expiresAt });
  return { ...report, warnings: participants.warnings, seasonId, seasonName: source.seasonName,
    configuredUrl: source.configuredUrl,
    sourceUrl: source.url, revisionId: participants.revisionId, fetchedAt: participants.fetchedAt,
    previewToken, expiresAt: new Date(expiresAt).toISOString() };
};

const apply = async (seasonId, previewToken, excludedTeamLinks = []) => {
  const saved = typeof previewToken === 'string' ? previews.get(previewToken) : null;
  if (!saved || saved.seasonId !== seasonId || saved.expiresAt <= Date.now()) throw fail('队伍预览已过期，请重新预览');
  const links = new Set(saved.participants.teams.map(team => team.link));
  if (!Array.isArray(excludedTeamLinks) || excludedTeamLinks.some(link => typeof link !== 'string' || !links.has(link))) {
    throw fail('排除的队伍不属于本次预览，请重新预览', 400);
  }
  const excluded = new Set(excludedTeamLinks);
  return identityTransaction(async transaction => {
    const source = await getSource(seasonId, transaction);
    if (source.url !== saved.source.url) throw fail('赛季 Liquipedia 页面已变化，请重新预览');
    const report = matchTeamsByPage({ sourceTeams: saved.participants.teams,
      ...await loadCatalog(seasonId, transaction), redirects: saved.redirects });
    if (decisionHash(report) !== saved.hash) throw fail('队伍页面绑定已变化，请重新预览');
    const selected = report.teams.filter(team => !excluded.has(team.link));
    const sourceKey = `page:${hash(source.url)}`;
    let createdTeams = 0, addedTeamSources = 0;
    for (const team of selected) {
      if (team.status !== 'matched') continue;
      const result = await membership.ensureSeasonTeam({ seasonId, teamId: team.teamId,
        sourceType: membership.SOURCE_TYPES.LIQUIPEDIA, sourceKey, transaction });
      createdTeams += Number(result.relationCreated);
      addedTeamSources += Number(result.sourceCreated);
    }
    return { ...report, createdTeams, addedTeamSources, excludedTeams: excluded.size, seasonId,
      sourceUrl: source.url, revisionId: saved.participants.revisionId,
      message: `已新增 ${createdTeams} 支赛季队伍，补充 ${addedTeamSources} 条 Liquipedia 来源；跳过 ${report.summary.skippedTeams} 支未匹配队伍。未配置选手阵容。` };
  });
};
module.exports = { preview, apply, decisionHash };
