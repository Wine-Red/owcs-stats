const cheerio = require('cheerio');

const clean = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
const identityKey = value => clean(value).toLowerCase();
const fail = message => Object.assign(new Error(message), { statusCode: 422 });

// Never request an arbitrary URL supplied by the browser. Only its validated wiki title
// is passed to our fixed Overwatch MediaWiki API endpoint.
const parseTournamentUrl = value => {
  try {
    const url = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(url.protocol) ||
        !['liquipedia.net', 'www.liquipedia.net'].includes(url.hostname) ||
        url.username || url.password || url.port) throw new Error();
    let page = url.pathname === '/overwatch/index.php'
      ? url.searchParams.get('title')
      : url.pathname.startsWith('/overwatch/') ? decodeURIComponent(url.pathname.slice(11)) : '';
    page = clean(page).replace(/_/g, ' ').replace(/^\/+|\/+$/g, '');
    if (!page || /[:?#\\]/.test(page) || [...page].some(char => char.charCodeAt(0) < 32) || /\.php$/i.test(page) || page.length > 250) throw new Error();
    return { page, url: `https://liquipedia.net/overwatch/${page.split('/').map(part => encodeURIComponent(part.replace(/ /g, '_'))).join('/')}` };
  } catch {
    throw Object.assign(new Error('请先在赛季可视化配置中保存有效的 Liquipedia Overwatch 赛事页面 URL'), { statusCode: 400 });
  }
};

const wikiLink = href => {
  if (!href) return '';
  try { return parseTournamentUrl(new URL(href, 'https://liquipedia.net').href).url; } catch { return ''; }
};
const isPlaceholder = name => !name || /^(tbd|tba|unknown|to be (announced|determined)|-+|\?+)$/i.test(name);

const parseRosterHtml = html => {
  const $ = cheerio.load(html);
  const shortNames = new Map();
  const registerShortName = (href, name) => {
    const link = wikiLink(href);
    if (!link || isPlaceholder(clean(name))) return;
    if (!shortNames.has(link)) shortNames.set(link, new Map());
    shortNames.get(link).set(identityKey(name), clean(name));
  };
  // Both variants are present in real tournament brackets/standings. Join by
  // the exact wiki link, never by similar full team names or logo filenames.
  $('[data-team-shortname]').each((_, element) => {
    registerShortName($(element).closest('a').attr('href'), $(element).attr('data-team-shortname'));
  });
  $('.block-team .name.visible-xs a, .team-template-text-short a').each((_, element) => {
    registerShortName($(element).attr('href'), $(element).text());
  });

  const teams = new Map();
  const warnings = [];
  let inParticipants = false;
  $('h2, .team-participant-card').each((_, element) => {
    if (element.tagName === 'h2') {
      inParticipants = /^(participants|participating teams|teams)$/i.test(clean($(element).text()).replace(/\[edit\]/gi, '').trim());
      return;
    }
    if (!inParticipants) return;
    const card = $(element);
    const anchor = card.find('.team-participant-card__header .name a').first();
    const name = clean(anchor.text());
    const link = wikiLink(anchor.attr('href'));
    if (!link || isPlaceholder(name)) {
      warnings.push('参赛列表中有待定或缺少身份链接的队伍，已跳过。');
      return;
    }
    if (!teams.has(link)) teams.set(link, { name, link, shortNames: [...(shortNames.get(link)?.values() || [])], players: [], warnings: [] });
    const team = teams.get(link);
    card.find('.team-participant-card__member').each((_, member) => {
      const row = $(member);
      const area = row.closest('[data-toggle-area-content]');
      const tabId = area.attr('data-toggle-area-content');
      const tab = area.closest('.toggle-area').find('[data-toggle-area-btn]').filter((_, button) => $(button).attr('data-toggle-area-btn') === tabId).first();
      const tabLabel = clean(tab.text());
      const rightRole = clean(row.find('.team-participant-card__member-role-right').text());
      if (/staff|coach|manager|analyst|owner|content|social/i.test(`${tabLabel} ${rightRole}`)) return;
      const role = row.find('.team-participant-card__member-role-left img').first().attr('alt') || '';
      const knownRole = /^(dps|damage|tank|support|flex)$/i.test(role);
      if (!knownRole && !/^(main|players|substitutes?|subs|reserves?|bench)$/i.test(tabLabel)) {
        team.warnings.push(`无法确认成员 ${clean(row.find('.team-participant-card__member-name').text()) || '（未命名）'} 的选手身份，已跳过。`);
        return;
      }
      const playerAnchor = row.find('.team-participant-card__member-name .name a').first();
      const playerName = clean(playerAnchor.text());
      const playerLink = wikiLink(playerAnchor.attr('href'));
      if (isPlaceholder(playerName) || !playerLink) {
        team.warnings.push(`阵容包含待定或缺少身份链接的选手 ${playerName || '（未命名）'}，已跳过。`);
        return;
      }
      if (!team.players.some(player => player.link === playerLink && identityKey(player.name) === identityKey(playerName))) {
        team.players.push({ name: playerName, link: playerLink, role: clean(role), rosterGroup: tabLabel || 'Players' });
      }
    });
  });
  if (!teams.size) throw fail('未识别到赛事 Participants 中的参赛阵容卡片，可能尚未公布或页面格式不受支持；未写入任何关联。请检查赛事页面。');
  for (const team of teams.values()) {
    if (!team.players.length) team.warnings.push('该队伍未识别到选手阵容，只能配置队伍关联。');
    team.warnings = [...new Set(team.warnings)];
  }
  return { teams: [...teams.values()], warnings: [...new Set(warnings)] };
};

module.exports = { parseTournamentUrl, parseRosterHtml, identityKey };
