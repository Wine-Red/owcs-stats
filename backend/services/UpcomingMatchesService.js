const cheerio = require('cheerio');
const { createCachedResource } = require('./CachedResource');
const { fetchParsedHtml } = require('./LiquipediaClient');

const LIQUIPEDIA_SITE_BASE = 'https://liquipedia.net';
const LIQUIPEDIA_UPCOMING_WIKITEXT = '{{#invoke:Lua|invoke|module=MatchTicker/Custom|fn=mainPage|type=upcoming|limit=50|filterbuttons-liquipediatier=1,2}}';
const LIQUIPEDIA_CACHE_TTL = 5 * 60 * 1000;

const normalizeWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim();

const fetchLiquipediaUpcomingHtml = async () => {
  const result = await fetchParsedHtml({ text: LIQUIPEDIA_UPCOMING_WIKITEXT });
  return result.html;
};

const extractUpcomingMatchesFromMatchesPage = pageHtml => {
  const $ = cheerio.load(pageHtml);
  const upcomingMatches = [];

  $('.match-info').each((_, element) => {
    const matchNode = $(element);
    const tournamentLinkEl = matchNode.find('.match-info-tournament-name a').first();
    const tournamentHref = tournamentLinkEl.attr('href') || '';
    const timestampRaw = Number(matchNode.find('.timer-object').first().attr('data-timestamp'));

    upcomingMatches.push({
      tournamentName: normalizeWhitespace(tournamentLinkEl.text()),
      timestamp: Number.isFinite(timestampRaw) ? timestampRaw * 1000 : null,
      link: tournamentHref ? `${LIQUIPEDIA_SITE_BASE}${tournamentHref}` : '',
      team1: {
        name: normalizeWhitespace(matchNode.find('.match-info-header-opponent-left .name').first().text()) || 'TBD'
      },
      team2: {
        name: normalizeWhitespace(matchNode.find('.match-info-header-opponent').last().find('.name').first().text()) || 'TBD'
      }
    });
  });

  return upcomingMatches.sort((left, right) => {
    const leftTime = Number.isFinite(left.timestamp) ? left.timestamp : Number.MAX_SAFE_INTEGER;
    const rightTime = Number.isFinite(right.timestamp) ? right.timestamp : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
};

const upcomingMatchesResource = createCachedResource({
  ttlMs: LIQUIPEDIA_CACHE_TTL,
  loader: async () => extractUpcomingMatchesFromMatchesPage(await fetchLiquipediaUpcomingHtml())
});

const getUpcomingMatches = () => upcomingMatchesResource.get('upcoming');

module.exports = {
  extractUpcomingMatchesFromMatchesPage,
  getUpcomingMatches,
  normalizeWhitespace
};
