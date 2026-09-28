const cheerio = require('cheerio');
const { createHash } = require('crypto');
const { parseTournamentUrl } = require('./LiquipediaRosterParser');

const clean = value => String(value || '').replace(/\[edit\]/g, '').replace(/\s+/g, ' ').trim();
const ownText = node => clean(node.clone().children().remove().end().text());
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const labels = [
  [/Upper Bracket Semifinals/gi, '胜者组半决赛'], [/Upper Bracket Quarterfinals/gi, '胜者组四分之一决赛'],
  [/Upper Bracket Final/gi, '胜者组决赛'], [/Lower Bracket Semifinals/gi, '败者组半决赛'],
  [/Lower Bracket Quarterfinals/gi, '败者组四分之一决赛'], [/Lower Bracket Final/gi, '败者组决赛'],
  [/Grand Finals?/gi, '总决赛'], [/Third[- ]place (?:Match|Playoff)/gi, '季军赛'],
  [/Regional Playoffs/gi, '赛区季后赛'], [/Regular Season/gi, '常规赛'], [/Last Chance Qualifier/gi, '最后机会资格赛'],
  [/Round Robin(?: Stage)?/gi, '循环赛'], [/Swiss(?: Stage)?/gi, '瑞士轮'],
  [/Group Stage/gi, '小组赛'], [/Group ([A-Z])/g, '$1 组'], [/Playoffs/gi, '季后赛'],
  [/Quarterfinals/gi, '四分之一决赛'], [/Semifinals/gi, '半决赛'], [/Finals?/gi, '决赛'],
  [/Upper Bracket Round (\d+)/gi, '胜者组第 $1 轮'], [/Lower Bracket Round (\d+)/gi, '败者组第 $1 轮'],
  [/Round (\d+)/gi, '第 $1 轮'], [/Week (\d+)/gi, '第 $1 周'],
  [/Seeding Decider(?: Matches)?/gi, '种子决定战'],
  [/(\d+)(?:st|nd|rd|th)-(\d+)(?:st|nd|rd|th) Decider(?: Match)?/gi, '第 $1–$2 种子决定战'], [/GS /g, '循环赛 '],
  [/(\d+)(?:st|nd|rd|th)-(\d+)(?:st|nd|rd|th) /g, '第 $1–$2 名 '],
  [/Standings/gi, '积分榜'], [/Match List/gi, '赛程'], [/Decider(?: Matches| Match)?/gi, '种子决定战']
];
const translateLabel = value => labels.reduce((text, [from, to]) => text.replace(from, to), clean(value));
// Template slot names do not imply how many teams actually play (byes are common).
const translateRoundLabel = (value, index) => translateLabel(clean(value)
  .replace(/Quarterfinals|Round of \d+/gi, `Round ${index + 1}`)) || '对阵';
const translateRule = value => {
  const sentences = {
    'Each team bans 1 hero per map, with the ban impacting both teams': '每局双方各禁用 1 名英雄，禁用对双方同时生效',
    "Each ban must be from a different role than the other team's ban": '双方禁用的英雄须属于不同职责',
    'Teams can only ban a hero once per series, but may repeat a ban from the opposing team': '同一场系列赛中，每队不能重复禁用同一英雄，但可禁用对手曾禁用的英雄',
    'The higher seeded team or team that has lost the last map chooses to ban first or second': '高顺位队伍或上一局败方选择先禁或后禁',
    'For Map 2 and onwards, the losing team of the previous map chooses to ban first or second.': '从第 2 局起，上一局败方选择先禁或后禁',
    'To determine ban priority for Map 1, a 1v1 Deathmatch is played between a player from each team. The winner of the 1v1 then chooses to either select the starting map or the first ban. Whichever option remains after the choice, the loser of the 1v1 selects.': '首局双方各派一名选手进行 1v1 死斗；胜者选择首张地图或首次禁用权，败者获得剩余选择权',
    'Tiebreakers': '同分排序规则', 'Head-to-head Series Differential': '相互交手大场净胜差',
    'Head-to-head Map Differential': '相互交手小局净胜差', 'Overall Map Differential': '总小局净胜差',
    'Overall Map Score % Differential': '总地图得分百分比差', 'Tiebreaker Match': '加赛',
    'Strength of Victory evaluate by combining records between all teams': '结合所有队伍的交手战绩评估胜场强度',
    'Tiebreakers will be applied until a team prevails.': '依次应用排序规则，直到有队伍分出先后',
    'Remaining tied teams start at the top of the list.': '剩余同分队伍从第一条规则重新比较',
    'This process is repeated until all teams are fully ranked': '重复此过程，直至确定全部排名',
    'Teams cannot play against another team from their qualifier group': '同一预选赛小组的队伍不能分在同组',
    "If a team is pulled that can't abide by these rules, they will go into the next avaliable group": '抽出的队伍若不符合分组限制，则进入下一个可用小组'
  };
  if (sentences[clean(value)]) return sentences[clean(value)];
  let text = clean(value)
    .replace(/Teams of (\d+-\d+) result will battle against with teams of (\d+-\d+) result, winners advance\.?/gi, '战绩为 $1 的队伍对阵战绩为 $2 的队伍，胜者晋级')
    .replace(/Round Robin with (\d+) groups/gi, '$1 组循环赛')
    .replace(/Top (\d+) teams of each group advance to /gi, '每组前 $1 名晋级至')
    .replace(/A maximum of (\d+) teams per conference can be placed into a group/gi, '每组最多有 $1 支来自同一大区的队伍')
    .replace(/Group Stage Draw(?:\[\d+\])?/gi, '小组赛抽签')
    .replace(/Pool (\d+) consists of (\d+)(?:st|nd) seed over all qualifiers:/gi, '第 $1 档：各预选赛第 $2 名：')
    .replace(/Pool (\d+) consists of the OWWC (\d+) Winner and Runner Up:/gi, '第 $1 档：$2 世界杯冠亚军：')
    .replace(/Double[- ]elimination bracket\.?/gi, '双败淘汰制')
    .replace(/Single[- ]elimination bracket\.?/gi, '单败淘汰制')
    .replace(/Swiss with (\d+) rounds\.?/gi, '$1 轮瑞士制')
    .replace(/All matches(?: \(excl\. Grand Finals?\))? are (?:Ft|Bo)(\d+)\.?/gi, (all, n) => `${/excl/.test(all) ? '除总决赛外，所有比赛' : '所有比赛'}采用${/Ft/.test(all) ? `先胜 ${n} 局` : `BO${n}`}制`)
    .replace(/Grand Finals? (?:is|are) Ft(\d+)\.?/gi, '总决赛先胜 $1 局')
    .replace(/Top (\d+) teams advance to /gi, '前 $1 名晋级至')
    .replace(/(\d+) teams that reach (\d+) wins advance\.?/gi, '$1 支取得 $2 胜的队伍晋级')
    .replace(/Hero Bans/gi, '英雄禁用');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  months.forEach((month, i) => { text = text.replace(new RegExp(`${month} (\\d+)(?:st|nd|rd|th)`, 'g'), `${i + 1}月$1日`); });
  text = text.replace(/(\d+)(?:st|nd|rd|th)/g, '$1日');
  const countries = { Americas: '美洲', EMEA: '欧洲中东非洲', Asia: '亚洲', 'Saudi Arabia': '沙特阿拉伯', China: '中国', Canada: '加拿大', 'United States': '美国', Sweden: '瑞典', Germany: '德国', France: '法国', 'South Korea': '韩国', Australia: '澳大利亚', Colombia: '哥伦比亚', Mexico: '墨西哥', Denmark: '丹麦', 'United Kingdom': '英国', Spain: '西班牙', Japan: '日本', Thailand: '泰国' };
  Object.entries(countries).forEach(([from, to]) => { text = text.replace(new RegExp(`\\b${from}\\b`, 'g'), to); });
  return translateLabel(text);
};
const article = href => {
  if (!href) return null;
  try {
    const url = new URL(href, 'https://liquipedia.net');
    if (url.searchParams.has('action') || url.searchParams.has('redlink')) return null;
    url.hash = '';
    return parseTournamentUrl(url.href).url;
  } catch { return null; }
};

function parseTournamentHtml({ html, page, revisionId, allowEmpty = false }) {
  if (!html || html.length < 100) throw new Error('Liquipedia 未返回赛事内容');
  const $ = cheerio.load(html);
  const pageUrl = parseTournamentUrl(`https://liquipedia.net/overwatch/${page.replace(/ /g, '_')}`).url;
  const headings = new Map();
  let sections = [];
  $('h2,h3,h4,h5,h6,a[href],.brkts-bracket-wrapper,.group-table,.standings-swiss,.brkts-matchlist').each((_, el) => {
    if (/^h[2-6]$/.test(el.tagName)) {
      const level = Number(el.tagName.slice(1));
      sections = sections.filter(section => section.level < level);
      sections.push({ level, title: clean($(el).text()) });
    } else headings.set(el, sections.map(section => section.title));
  });
  const team = node => {
    const dynamic = node.find('[data-team-name]').first();
    const link = node.find('a[href^="/overwatch/"]').filter((_, a) => !$(a).hasClass('new')).first();
    const name = clean(node.attr('aria-label') || dynamic.attr('data-team-name') || link.attr('title') || node.find('.name,.team-template-text').first().text()) || '待定';
    return { name, shortName: clean(dynamic.attr('data-team-shortname')) || name, url: article(link.attr('href')) };
  };
  const score = value => {
    const text = clean(value);
    return /^\d+$/.test(text) ? Number(text) : /^[WL]$/i.test(text) ? text.toUpperCase() : null;
  };
  const match = (node, slot) => {
    const popup = node.find('.brkts-popup').first();
    let sides = popup.find('.match-info-header-opponent');
    if (sides.length !== 2) sides = node.children('.brkts-opponent-entry,.brkts-matchlist-opponent');
    const entries = node.children('.brkts-opponent-entry');
    // Cheerio.map drops nulls, so extract score positions independently.
    const values = [0, 1].map(i => entries.length ? score(entries.eq(i).find('.brkts-opponent-score-inner').text()) : score(node.children('.brkts-matchlist-score').eq(i).text()));
    const opponents = [0, 1].map(i => ({ ...team(sides.eq(i)), score: values[i], winner: sides.eq(i).hasClass('match-info-header-winner') || entries.eq(i).find('.brkts-opponent-win').length > 0 }));
    const seconds = Number(popup.find('[data-timestamp]').first().attr('data-timestamp'));
    const timestamp = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
    const bo = clean(popup.find('.match-info-header-scoreholder-lower').text()).match(/Bo\d+/i)?.[0]?.toUpperCase() || null;
    return { id: slot, opponents, timestamp, bestOf: bo, sourceUrl: pageUrl };
  };
  const blocks = [];
  const warnings = [];
  $('.standings-swiss,.group-table,.brkts-bracket-wrapper,.brkts-matchlist').each((index, el) => {
    const node = $(el);
    const id = `${hash(page)}-${index}`;
    const sourceHeadings = headings.get(el) || [];
    const sourceTitle = sourceHeadings.at(-1) || '赛程';
    const base = { id, title: translateLabel(sourceTitle), sourceTitle, sourceHeadings, sourceUrl: pageUrl };
    if (node.hasClass('standings-swiss')) {
      const headers = node.find('thead th').map((_, e) => translateLabel($(e).text())).get();
      const rows = node.find('tr.table2__row--body').map((_, e) => {
        const row = $(e), cells = row.children('td');
        return { rank: clean(cells.eq(0).text()), team: team(cells.eq(1)), matches: clean(cells.eq(2).text()), maps: clean(cells.eq(3).text()), status: row.attr('data-position-status') || '', rounds: cells.slice(4).map((_, cell) => ({ score: clean($(cell).find('.label--standings-result').text()) || '—', opponent: team($(cell)) })).get() };
      }).get();
      if (rows.length) blocks.push({ ...base, type: 'swiss', title: '瑞士轮积分', rows, roundLabels: headers.slice(4) });
    } else if (node.hasClass('group-table')) {
      // The template includes historical weekly tables. Use its selected snapshot.
      const selected = (node.attr('class') || '').match(/toggle-area-(\d+)/)?.[1];
      const results = node.children('.group-table-results');
      const current = results.filter(`[data-toggle-area-content="${selected}"]`);
      const table = current.length ? current : results.last();
      const rows = table.find('.group-table-result-row').map((_, e) => {
        const row = $(e);
        return { rank: clean(row.find('.group-table-rank').text()), team: team(row.find('.group-table-entry')), matches: clean(row.find('.group-table-match-score').text()), maps: clean(row.find('.group-table-game-score').text()), difference: clean(row.find('.group-table-game-diff').text()), status: row.find('.bg-up').length ? 'up' : row.find('.bg-down').length ? 'down' : '' };
      }).get();
      if (rows.length) blocks.push({ ...base, type: 'standings', title: /Group/.test(sourceTitle) ? translateLabel(sourceTitle) : `${translateLabel(sourceTitle)} · 积分`, rows });
    } else if (node.hasClass('brkts-matchlist')) {
      const titleNode = node.find('.brkts-matchlist-title').first().clone();
      titleNode.find('.general-collapsible-expand-button,.general-collapsible-collapse-button').remove();
      const matches = node.find('.brkts-matchlist-match').map((i, e) => match($(e), `${id}-m${i}`)).get();
      const label = translateLabel(clean(titleNode.text()).replace(/Show Hide/g, ''));
      if (matches.length) blocks.push({ ...base, type: 'matches', title: label === base.title ? label : `${base.title} · ${label}`, matches });
    } else {
      const matches = [], edges = [];
      const bracket = node.children('.brkts-bracket');
      const readHeaders = header => header.children('.brkts-header').map((_, h) => ownText($(h))).get();
      // Walk source columns from the right. A qualification output is a separate
      // column, not a match round. Layout depth remains independent of the label.
      const lastRound = (body, headers) => headers.length - 1 - (body.children('.brkts-round-qual').length ? 1 : 0);
      let nextY = 0;
      const walk = (body, headers, roundIndex = lastRound(body, headers)) => {
        const lower = body.children('.brkts-round-lower');
        let childHeaders = headers;
        let childRoundIndex = roundIndex - 1;
        const children = [];
        lower.children().each((_, element) => {
          const child = $(element);
          if (child.hasClass('brkts-round-header')) { childHeaders = readHeaders(child); childRoundIndex = undefined; }
          if (child.hasClass('brkts-round-body')) { const result = walk(child, childHeaders, childRoundIndex); if (result) children.push(result); }
        });
        const element = body.children('.brkts-round-center').children('.brkts-match').first();
        if (!element.length) return null;
        const depth = children.length ? Math.max(...children.map(c => c.depth)) + 1 : 0;
        const y = children.length ? (children[0].y + children.at(-1).y) / 2 : nextY++;
        const sourceRound = headers[roundIndex] || '';
        const item = { ...match(element, `${id}-m${matches.length}`), depth, y, sourceRound,
          round: translateRoundLabel(sourceRound, Math.max(0, roundIndex)) };
        matches.push(item);
        children.forEach(child => edges.push({ from: child.id, to: item.id }));
        body.children('.brkts-round-center').children('.brkts-third-place-match').each((_, extra) => {
          matches.push({ ...match($(extra), `${id}-m${matches.length}`), depth, y: nextY++, sourceRound: 'Third Place Match', round: '季军赛' });
        });
        return item;
      };
      let headers = [];
      bracket.children().each((_, element) => {
        const child = $(element);
        if (child.hasClass('brkts-round-header')) headers = readHeaders(child);
        if (child.hasClass('brkts-round-body')) { walk(child, headers); nextY += 0.3; }
      });
      if (matches.length !== node.find('.brkts-match').length) {
        // Fail visibly into a complete card list, rather than silently losing games.
        warnings.push('部分对阵结构暂不支持连线，已完整显示比赛列表。');
        blocks.push({ ...base, type: 'matches', matches: node.find('.brkts-match').map((i, e) => match($(e), `${id}-m${i}`)).get() });
      } else if (matches.length) blocks.push({ ...base, type: 'bracket', matches, edges });
    }
  });
  const rules = [];
  const format = $('h2,h3,h4').filter((_, el) => /^Format$/i.test(clean($(el).text()))).first();
  if (format.length) {
    const anchor = format.parent().hasClass('mw-heading') ? format.parent() : format;
    anchor.nextUntil('.mw-heading,h2,h3,h4').find('li').each((_, el) => {
      const item = $(el).clone(); item.find('ul,ol,.general-collapsible').remove();
      const original = clean(item.text());
      if (original && !/^Click Show/.test(original) && rules.length < 80) rules.push({ original, text: translateRule(original), level: Math.min($(el).parents('li').length, 2) });
    });
  }
  const children = new Set(), links = [];
  $('a[href]').each((_, el) => {
    if ($(el).hasClass('new')) return;
    const url = article($(el).attr('href'));
    if (!url) return;
    const candidate = parseTournamentUrl(url).page;
    const root = page.replace(/_/g, ' ');
    if (candidate === root) return;
    const sourceHeadings = headings.get(el) || [];
    const node = $(el), label = clean(node.text());
    const navigation = node.closest('nav,.tabs-static,.tabs-dynamic,.nav-tabs').length > 0;
    const detail = !node.closest('.team-participant-card,.navbox').length
      && /^(?:Results|Matches|Standings)$/i.test(sourceHeadings[0] || '')
      && (/detailed (?:results|matches)|full (?:results|schedule)|match (?:list|details)|^matches$|^results$/i.test(label)
        || /^\/(?:Regular_Season|Group_Stage|Playoffs|Swiss)$/.test(new URL(url).pathname.slice(new URL(pageUrl).pathname.length)));
    links.push({ page: candidate, label, sourceHeadings, kind: navigation ? 'navigation' : detail ? 'detail' : 'reference' });
    if (candidate.startsWith(`${root}/`) && /\/(?:Regular Season|Group Stage|Playoffs|Swiss)(?:$|\/)/i.test(candidate)) children.add(candidate);
  });
  if (!blocks.length && !allowEmpty) throw new Error('未识别到可展示的积分表或对阵，保留上次同步结果');
  const shortNames = new Map();
  for (const block of blocks) for (const m of block.matches || []) for (const t of m.opponents) {
    if (t.url && t.shortName !== t.name) shortNames.set(t.url, t.shortName);
  }
  for (const block of blocks) for (const row of block.rows || []) {
    for (const t of [row.team, ...(row.rounds || []).map(r => r.opponent)]) if (shortNames.has(t.url)) t.shortName = shortNames.get(t.url);
  }
  return { page, revisionId, sourceUrl: pageUrl, rules, blocks, children: [...children], links, warnings };
}

module.exports = { parseTournamentHtml, translateLabel, translateRule };
