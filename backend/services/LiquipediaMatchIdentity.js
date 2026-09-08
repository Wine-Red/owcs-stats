const { requestJson, LIQUIPEDIA_API_BASE } = require('./LiquipediaClient');
const { parseTournamentUrl } = require('./LiquipediaRosterParser');

const nameKey = value => String(value || '').replace(/_/g, ' ').trim().toLowerCase();

// Split template arguments only at the current nesting level (maps, opponents,
// links and nested templates may themselves contain pipes).
const splitArguments = text => {
  const parts = []; let start = 0; let braces = 0; let links = 0;
  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') { braces++; i++; }
    else if (pair === '}}') { braces--; i++; }
    else if (pair === '[[') { links++; i++; }
    else if (pair === ']]') { links--; i++; }
    else if (text[i] === '|' && !braces && !links) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts;
};

const template = text => {
  const parts = splitArguments(text.trim().replace(/^\{\{/, '').replace(/\}\}$/, ''));
  const args = {}; let index = 1;
  for (const part of parts.slice(1)) {
    const named = part.match(/^([\w-]+)\s*=([\s\S]*)$/);
    if (named) args[named[1].toLowerCase()] = named[2].trim();
    else args[index++] = part;
  }
  return { name: nameKey(parts[0]), args };
};

const sourceTimestamp = value => {
  const offsets = { UTC: '+00:00', GMT: '+00:00', PDT: '-07:00', PST: '-08:00', EDT: '-04:00', EST: '-05:00', CEST: '+02:00', CET: '+01:00', KST: '+09:00', JST: '+09:00', CST: '+08:00', ICT: '+07:00' };
  const zone = String(value || '').match(/\{\{Abbr\/([A-Z]+)\}\}/)?.[1];
  if (!zone || !offsets[zone] || !/\d{1,2}:\d{2}/.test(value)) return null;
  const date = value.replace(/\{\{Abbr\/[A-Z]+\}\}/, offsets[zone]).replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/\s+-\s+/, ' ');
  const millis = Date.parse(date);
  return Number.isFinite(millis) ? millis : null;
};

const extractMatchIdentities = (wikitext, pageId) => {
  const text = String(wikitext || '').replace(/<!--[\s\S]*?-->/g, '');
  const result = [];
  const groups = /\{\{\s*(Bracket|Matchlist)\s*\|/gi;
  let found;
  while ((found = groups.exec(text))) {
    let depth = 1; let end = groups.lastIndex;
    for (; end < text.length && depth; end++) {
      if (text.slice(end, end + 2) === '{{') { depth++; end++; }
      else if (text.slice(end, end + 2) === '}}') { depth--; end++; }
    }
    if (depth) continue;
    const group = template(text.slice(found.index, end));
    const groupId = group.args.id;
    if (!groupId || !/^[a-zA-Z0-9_-]{1,80}$/.test(groupId)) continue;
    let matchIndex = 0;
    const entries = Object.entries(group.args).filter(([slot]) => /^(r\d+m\d+|rxmbr|rxmtp|m\d+)$/i.test(slot));
    if (group.name === 'matchlist') entries.sort(([a], [b]) => Number(a.replace(/^m/, '')) - Number(b.replace(/^m/, '')));
    for (const [slot, raw] of entries) {
      matchIndex++;
      const match = template(raw);
      if (match.name !== 'match') continue;
      const opponents = [match.args.opponent1, match.args.opponent2].map(rawOpponent => {
        const opponent = template(rawOpponent || '');
        return opponent.name === 'teamopponent' ? opponent.args[1] || '' : '';
      });
      if (opponents.some(name => !name || /^(tbd|tba|bye)$/i.test(name))) continue;
      const bracketSlot = slot.match(/^r(\d+)m(\d+)$/i);
      const matchId = group.name === 'matchlist' ? String(matchIndex).padStart(4, '0')
        : bracketSlot ? `R${bracketSlot[1].padStart(2, '0')}-M${bracketSlot[2].padStart(3, '0')}`
          : slot.toLowerCase() === 'rxmbr' ? 'RxMBR' : 'RxMTP';
      result.push({ sourceId: `overwatch:${groupId}_${matchId}`, sourcePageId: pageId, sourceGroup: groupId,
        sourceSlot: slot.toUpperCase(), opponents, timestamp: sourceTimestamp(match.args.date) });
    }
    groups.lastIndex = end;
  }
  return result;
};

const attachMatchIdentities = async matches => {
  const pages = [...new Set(matches.map(match => parseTournamentUrl(match.link).page))];
  if (!pages.length) return matches;
  const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'revisions', titles: pages.join('|'),
    rvprop: 'content', rvslots: 'main', redirects: '1' });
  const response = await requestJson(`${LIQUIPEDIA_API_BASE}?${params}`);
  if (response.error) throw new Error('Liquipedia match identities unavailable');
  const records = new Map();
  for (const page of Object.values(response.query?.pages || {})) {
    records.set(nameKey(page.title), extractMatchIdentities(page.revisions?.[0]?.slots?.main?.['*'], page.pageid));
  }
  for (const redirect of response.query?.redirects || []) records.set(nameKey(redirect.from), records.get(nameKey(redirect.to)) || []);
  return matches.map(match => {
    const page = parseTournamentUrl(match.link).page;
    const keys = [match.team1, match.team2].map(team => nameKey(team.wikiName || team.name)).sort();
    let candidates = (records.get(nameKey(page)) || []).filter(record => record.opponents.map(nameKey).sort().every((key, i) => key === keys[i]));
    // Even a unique pairing must agree on time: page and ticker can be cached
    // at different revisions. Missing/ambiguous evidence never invents an ID.
    candidates = candidates.filter(record => record.timestamp != null && record.timestamp === match.timestamp);
    if (candidates.length !== 1) return { ...match, sourceId: null };
    const { opponents, timestamp, ...identity } = candidates[0]; // eslint-disable-line no-unused-vars
    return { ...match, ...identity, sourcePage: page };
  });
};

module.exports = { splitArguments, extractMatchIdentities, attachMatchIdentities, sourceTimestamp };
