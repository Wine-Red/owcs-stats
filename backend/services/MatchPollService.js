const { createHash, randomBytes } = require('crypto');
const { Op, fn, col } = require('sequelize');
const sequelize = require('../config/database');
const MatchPoll = require('../models/MatchPoll');
const { MatchVote, VoteVisitor } = require('../models/MatchVote');
const Match = require('../models/Match');
const Config = require('../models/Config');
const Season = require('../models/Season');
const { loadTeamIdentities, normalizeTeamIdentity } = require('./TeamAliasService');
const { parseTournamentUrl } = require('./LiquipediaRosterParser');
const upcoming = require('./UpcomingMatchesService');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const pairKey = (a, b) => [Number(a), Number(b)].sort((x, y) => x - y).join(':');
const hashToken = token => createHash('sha256').update(token).digest('hex');
const positiveId = value => /^\d+$/.test(String(value || '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const dateKey = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

// A date narrows rematches; never choose the first candidate or the nearest
// match from an unbounded history. Both sides of the association must be unique.
const findPollLinks = (polls, matches, now = Date.now()) => {
  const proposals = new Map();
  const reserved = new Set(polls.filter(p => p.matchId).map(p => Number(p.matchId)));
  for (const poll of polls) {
    if (poll.matchId || new Date(poll.scheduledAt).getTime() > now) continue;
    const candidates = matches.filter(match => (poll.scopeSeasonIds || [Number(poll.seasonId)]).includes(Number(match.seasonId))
      && pairKey(match.team1Id, match.team2Id) === poll.pairKey
      && String(match.matchDate).slice(0, 10) === dateKey(poll.scheduledAt));
    if (candidates.length !== 1 || reserved.has(Number(candidates[0].id))) continue;
    const matchId = Number(candidates[0].id);
    proposals.set(matchId, [...(proposals.get(matchId) || []), poll.id]);
  }
  return [...proposals].filter(([, ids]) => ids.length === 1).map(([matchId, ids]) => ({ pollId: ids[0], matchId }));
};

const reconcilePolls = async seasonId => {
  const polls = await MatchPoll.findAll({ raw: true });
  if (!polls.length) return;
  const configs = await Config.findAll({ where: { key: { [Op.like]: 'visualize_season_%' } }, raw: true });
  const scopeByPage = new Map();
  for (const config of configs) {
    try {
      const id = Number(config.key.match(/^visualize_season_(\d+)$/)?.[1]);
      const value = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
      const page = parseTournamentUrl(value.liquipediaTournamentUrl).page;
      if (id) scopeByPage.set(page, [...(scopeByPage.get(page) || []), id]);
    } catch { /* Unconfigured seasons have no source scope. */ }
  }
  for (const poll of polls) poll.scopeSeasonIds = scopeByPage.get(poll.sourcePage) || [Number(poll.seasonId)];
  const relevant = seasonId ? polls.filter(p => p.scopeSeasonIds.includes(Number(seasonId))) : polls;
  const matches = await Match.findAll({ where: { seasonId: { [Op.in]: [...new Set(relevant.flatMap(p => p.scopeSeasonIds))] } }, raw: true });
  // Source corrections may change an already linked formal match.
  for (const poll of relevant.filter(p => p.matchId)) {
    const match = matches.find(m => Number(m.id) === Number(poll.matchId));
    if (!match || !poll.scopeSeasonIds.includes(Number(match.seasonId)) || pairKey(match.team1Id, match.team2Id) !== poll.pairKey) {
      await MatchPoll.update({ matchId: null }, { where: { id: poll.id, matchId: poll.matchId } });
      poll.matchId = null;
    }
  }
  for (const link of findPollLinks(relevant, matches)) {
    try {
      await MatchPoll.update({ matchId: link.matchId }, { where: { id: link.pollId, matchId: null } });
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    }
  }
};

const getContext = async seasonId => {
  if (!positiveId(seasonId)) throw fail('赛季参数无效');
  if (!await Season.findByPk(seasonId)) throw fail('赛季不存在', 404);
  const config = await Config.findByPk(`visualize_season_${seasonId}`);
  const value = typeof config?.value === 'string' ? JSON.parse(config.value) : config?.value;
  if (!value?.liquipediaTournamentUrl) return { sources: [], stale: false };
  const page = parseTournamentUrl(value.liquipediaTournamentUrl).page;
  const [result, { identityMap }] = await Promise.all([upcoming.getUpcomingMatches(), loadTeamIdentities()]);
  const resolve = team => identityMap.get(normalizeTeamIdentity(team?.name)) || identityMap.get(normalizeTeamIdentity(team?.wikiName));
  const sources = result.data.filter(source => source.sourceId && source.sourcePage === page).flatMap(source => {
    const team1 = resolve(source.team1); const team2 = resolve(source.team2);
    if (!team1 || !team2 || Number(team1.id) === Number(team2.id)) return [];
    return [{ sourceId: source.sourceId, sourcePage: source.sourcePage, sourceGroup: source.sourceGroup,
      seasonId: Number(seasonId), team1Id: Number(team1.id), team2Id: Number(team2.id),
      pairKey: pairKey(team1.id, team2.id), scheduledAt: new Date(source.timestamp),
      team1Name: team1.name, team2Name: team2.name, timestamp: source.timestamp }];
  });
  return { sources, sourcePage: page, stale: !!result.stale };
};

const visitorHash = async token => {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = hashToken(token);
  return await VoteVisitor.findByPk(hash) ? hash : null;
};

const createVisitor = async () => {
  const token = randomBytes(32).toString('hex');
  await VoteVisitor.create({ tokenHash: hashToken(token) });
  return token;
};

const summarizePolls = async (polls, voterHash) => {
  if (!polls.length) return new Map();
  const ids = polls.map(p => p.id);
  const [counts, own] = await Promise.all([
    MatchVote.findAll({ where: { pollId: ids }, attributes: ['pollId', 'teamId', [fn('COUNT', col('id')), 'votes']], group: ['pollId', 'teamId'], raw: true }),
    voterHash ? MatchVote.findAll({ where: { pollId: ids, voterHash }, raw: true }) : []
  ]);
  return new Map(polls.map(poll => {
    const votes = Object.fromEntries(counts.filter(c => Number(c.pollId) === Number(poll.id)).map(c => [c.teamId, Number(c.votes)]));
    return [Number(poll.id), { pollId: poll.id, sourceId: poll.sourceId, team1Id: poll.team1Id, team2Id: poll.team2Id,
      votes, total: Object.values(votes).reduce((a, b) => a + b, 0),
      myTeamId: own.find(v => Number(v.pollId) === Number(poll.id))?.teamId || null,
      matchId: poll.matchId, closed: true }];
  }));
};

const getSummary = async (seasonId, token) => {
  if (!positiveId(seasonId)) throw fail('赛季参数无效');
  let context;
  try { context = await getContext(seasonId); }
  catch (error) {
    if (error.statusCode) throw error;
    context = { sources: [], stale: true };
  }
  // Update only voting metadata, never the schedule or formal match records.
  if (!context.stale) {
    for (const source of context.sources) await MatchPoll.update({ scheduledAt: source.scheduledAt }, {
      where: { sourceId: source.sourceId, pairKey: source.pairKey, matchId: null }
    });
  }
  await reconcilePolls(Number(seasonId));
  const formalMatches = await Match.findAll({ where: { seasonId }, attributes: ['id'], raw: true });
  const formalIds = formalMatches.map(m => Number(m.id));
  const scopes = [{ seasonId }, ...(context.sourcePage ? [{ sourcePage: context.sourcePage }] : []),
    ...(formalIds.length ? [{ matchId: formalIds }] : [])];
  const polls = await MatchPoll.findAll({ where: { [Op.or]: scopes }, raw: true });
  const summaries = await summarizePolls(polls, await visitorHash(token));
  const sources = {};
  for (const source of context.sources) {
    const poll = polls.find(p => p.sourceId === source.sourceId && p.pairKey === source.pairKey);
    sources[source.sourceId] = { ...(poll ? summaries.get(poll.id) : { votes: {}, total: 0, myTeamId: null }),
      sourceId: source.sourceId, team1Id: source.team1Id, team2Id: source.team2Id,
      closed: context.stale || source.timestamp <= Date.now() || !!poll?.matchId,
      timestamp: source.timestamp };
  }
  return { sources, matches: Object.fromEntries(polls.filter(p => formalIds.includes(Number(p.matchId))).map(p => [p.matchId, summaries.get(p.id)])), stale: context.stale };
};

const castVote = async ({ seasonId, sourceId, teamId, team1Id, team2Id }, token) => {
  if (!positiveId(seasonId) || !positiveId(teamId) || !positiveId(team1Id) || !positiveId(team2Id)
      || typeof sourceId !== 'string' || sourceId.length > 191) throw fail('投票参数无效');
  const voterHash = await visitorHash(token);
  if (!voterHash) throw fail('投票身份已失效，请重新进入页面', 401);
  const context = await getContext(seasonId);
  if (context.stale) throw fail('赛程暂时无法确认，请稍后再试', 503);
  const candidates = context.sources.filter(s => s.sourceId === sourceId);
  if (candidates.length !== 1) throw fail('这场比赛已不在当前赛程中，请刷新页面', 409);
  const source = candidates[0];
  if (source.pairKey !== pairKey(team1Id, team2Id)) throw fail('对阵已变更，请刷新页面后重新选择', 409);
  if (![source.team1Id, source.team2Id].includes(Number(teamId))) throw fail('请选择本场参赛队伍');
  if (source.timestamp <= Date.now()) throw fail('比赛已到开赛时间，投票已截止', 409);
  const where = { sourceId, pairKey: source.pairKey };
  // Do not SELECT a missing unique key inside REPEATABLE READ: simultaneous
  // first votes would take conflicting gap locks. A standalone INSERT settles
  // identity first; the short voting transaction locks the existing row.
  try {
    await MatchPoll.create({ ...where, seasonId: Number(seasonId), sourcePage: source.sourcePage, sourceGroup: source.sourceGroup,
      team1Id: source.team1Id, team2Id: source.team2Id, scheduledAt: source.scheduledAt });
  } catch (error) {
    if (error.name !== 'SequelizeUniqueConstraintError') throw error;
  }
  await sequelize.transaction(async transaction => {
    const poll = await MatchPoll.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
    if (poll.matchId || source.timestamp <= Date.now()) throw fail('投票已截止', 409);
    await poll.update({ scheduledAt: source.scheduledAt }, { transaction });
    const existing = await MatchVote.findOne({ where: { pollId: poll.id, voterHash }, transaction });
    if (existing) await existing.update({ teamId: Number(teamId) }, { transaction });
    else await MatchVote.create({ pollId: poll.id, voterHash, teamId: Number(teamId) }, { transaction });
  });
  return getSummary(seasonId, token);
};

module.exports = { createVisitor, getSummary, castVote, reconcilePolls, findPollLinks, pairKey, hashToken };
