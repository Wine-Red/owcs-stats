const cheerio = require('cheerio');
const { createCachedResource } = require('./CachedResource');
const { fetchParsedHtml } = require('./LiquipediaClient');
const { attachMatchIdentities } = require('./LiquipediaMatchIdentity');

const LIQUIPEDIA_SITE_BASE = 'https://liquipedia.net';
const LIQUIPEDIA_UPCOMING_WIKITEXT = '{{#invoke:Lua|invoke|module=MatchTicker/Custom|fn=mainPage|type=upcoming|limit=50|filterbuttons-liquipediatier=1,2}}';
const LIQUIPEDIA_CACHE_TTL = 5 * 60 * 1000;

const normalizeWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim();

const fetchLiquipediaUpcomingHtml = async () => {
  const result = await fetchParsedHtml({ text: LIQUIPEDIA_UPCOMING_WIKITEXT });
  if (typeof result.html !== 'string' || !result.html.trim()) throw new Error('Upcoming source did not return parsed HTML');
  return result.html;
};

const extractUpcomingMatchesFromMatchesPage = pageHtml => {
  const $ = cheerio.load(pageHtml);
  const upcomingMatches = [];

  $('.match-info').each((_, element) => {
    const matchNode = $(element);
    const tournamentLinkEl = matchNode.find('.match-info-tournament-name a').first();
    const tournamentHref = tournamentLinkEl.attr('href') || '';
    const timestampText = matchNode.find('.timer-object').first().attr('data-timestamp');
    const timestampRaw = timestampText?.trim() ? Number(timestampText) : NaN;

    upcomingMatches.push({
      tournamentName: normalizeWhitespace(tournamentLinkEl.text()),
      timestamp: Number.isFinite(timestampRaw) && timestampRaw > 0 ? timestampRaw * 1000 : null,
      link: tournamentHref ? `${LIQUIPEDIA_SITE_BASE}${tournamentHref}` : '',
      team1: {
        name: normalizeWhitespace(matchNode.find('.match-info-header-opponent-left .name').first().text()) || 'TBD',
        wikiName: matchNode.find('.match-info-header-opponent-left .name a').first().attr('title') || ''
      },
      team2: {
        name: normalizeWhitespace(matchNode.find('.match-info-header-opponent').last().find('.name').first().text()) || 'TBD',
        wikiName: matchNode.find('.match-info-header-opponent').last().find('.name a').first().attr('title') || ''
      }
    });
  });

  return upcomingMatches.sort((left, right) => {
    const leftTime = Number.isFinite(left.timestamp) ? left.timestamp : Number.MAX_SAFE_INTEGER;
    const rightTime = Number.isFinite(right.timestamp) ? right.timestamp : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
};

function createUpcomingResources({
  loadSchedule = async () => extractUpcomingMatchesFromMatchesPage(await fetchLiquipediaUpcomingHtml()),
  attachIdentities = attachMatchIdentities, ttlMs = LIQUIPEDIA_CACHE_TTL, maxWaitMs = 25000
} = {}) {
  // Both consumers share the same parsed ticker and in-flight request. A
  // second parse would needlessly wait for another 30-second source slot.
  const schedule = createCachedResource({ ttlMs, maxWaitMs, loader: loadSchedule });
  const getUpcomingSchedule = () => schedule.get('schedule');
  let identityObservation, identityResource, lastVotingResult;
  const getUpcomingMatches = async () => {
    const result = await getUpcomingSchedule();
    // Stale observations may be displayed, but must never authorize voting.
    if (result.stale) return { ...result, data: lastVotingResult?.observedAt === result.observedAt
      ? lastVotingResult.data : result.data.map(match => ({ ...match, sourceId: null })) };
    // Enrichment cannot extend the source freshness window. A new source
    // observation invalidates identities; retain only the current resource.
    if (identityObservation !== result.observedAt) {
      identityObservation = result.observedAt;
      identityResource = createCachedResource({ ttlMs, maxWaitMs, loader: async () => {
        try { return await attachIdentities(result.data); }
        catch (error) {
          console.warn('[match-identity]', error.message);
          return result.data.map(match => ({ ...match, sourceId: null }));
        }
      } });
    }
    const voting = { ...await identityResource.get('upcoming'), observedAt: result.observedAt };
    if (identityObservation === result.observedAt) lastVotingResult = voting;
    return voting;
  };
  return { getUpcomingSchedule, getUpcomingMatches };
}
const { getUpcomingMatches, getUpcomingSchedule } = createUpcomingResources();

module.exports = {
  extractUpcomingMatchesFromMatchesPage,
  getUpcomingMatches,
  getUpcomingSchedule,
  createUpcomingResources,
  normalizeWhitespace
};
