import { load } from 'cheerio';
import { setTimeout as sleep } from 'node:timers/promises';

export function wikiPage(url) {
  if (!url) throw new Error('当前赛事未配置 Liquipedia 页面；可提供具体赛事页面。');
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.hostname !== 'liquipedia.net' || u.port || u.username || u.password || u.search || !u.pathname.startsWith('/overwatch/'))
    throw new Error('只支持 https://liquipedia.net/overwatch/ 下的赛事资料页面。');
  const page = decodeURIComponent(u.pathname.slice('/overwatch/'.length));
  if (!page || /(?:\.php|:|\.\.|[\x00-\x1f])/.test(page)) throw new Error('请使用正常的 Overwatch 赛事页面地址。');
  return { page, url: `https://liquipedia.net/overwatch/${page.split('/').map(encodeURIComponent).join('/')}` };
}

export function extractPage(data, url, section) {
  if (!data?.parse?.text?.['*']) throw new Error(data?.error?.info || 'Liquipedia 没有返回可读正文。');
  const $ = load(data.parse.text['*']);
  $('script,style,.mw-editsection,.navbox,.toc').remove();
  $('br').replaceWith('\n');
  $('tr,p,li,div').append('\n');
  const sections = (data.parse.sections || []).filter(s => /^\d+$/.test(s.index)).map(s => ({ index: s.index, title: load(s.line).text(), anchor: s.anchor }));
  $('h2,h3,h4,h5').each((_, el) => {
    const node = $(el), anchor = node.find('[id]').first().attr('id') || node.attr('id');
    node.before(`\n§SECTION:${anchor}§\n`);
  });
  const text = $.root().text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  let content = text.split('§SECTION:')[0];
  if (section && section !== '0') {
    const entry = sections.find(s => s.index === section);
    if (!entry) throw new Error('章节编号不存在，请使用返回的章节目录。');
    const marker = `§SECTION:${entry.anchor}§`, offset = text.indexOf(marker);
    if (offset < 0) throw new Error('无法定位该章节正文；请查看原始来源。');
    content = text.slice(offset + marker.length).split('§SECTION:')[0];
  }
  return { title: data.parse.title, sections, content: content.slice(0, 16000).trim(),
    truncated: content.length > 16000, source: { url, revision: data.parse.revid, observed_at: new Date().toISOString(), attribution: 'Liquipedia · CC BY-SA 3.0' } };
}

export function createWiki({ fetcher = fetch, interval = 30000 } = {}) {
  const cache = new Map(), configCache = new Map();
  let next = 0;
  return {
    async read({ url, competitionId, section, signal }) {
      if (!url && competitionId) {
        const stored = configCache.get(competitionId);
        if (stored?.until > Date.now()) url = stored.url;
        else {
          const r = await fetcher(`https://stats.owmini.xyz/public-api/site/v1/config/visualize_season_${competitionId}`, {
            signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(15000)]), redirect: 'error',
          });
          if (!r.ok) throw new Error('暂时无法读取赛事的 Liquipedia 配置。');
          url = (await r.json()).liquipediaTournamentUrl;
          configCache.set(competitionId, { url, until: Date.now() + 300000 });
          if (configCache.size > 64) configCache.delete(configCache.keys().next().value);
        }
      }
      const target = wikiPage(url), cached = cache.get(target.page);
      if (cached?.until > Date.now()) return { ...extractPage(cached.data, target.url, section), source: { ...cached.source }, cached: true };
      const delay = Math.max(0, next - Date.now()); next = Math.max(Date.now(), next) + interval;
      if (delay) await sleep(delay, undefined, { signal });
      const query = new URLSearchParams({ action: 'parse', page: target.page, prop: 'text|sections|revid', format: 'json' });
      const r = await fetcher(`https://liquipedia.net/overwatch/api.php?${query}`, {
        redirect: 'error', headers: { 'User-Agent': 'OWCSStatsAssistant/0.1 (local testing; admin@owmini.xyz)', Accept: 'application/json' },
        signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(30000)]),
      });
      if (!r.ok) throw new Error(`Liquipedia 暂时无法读取（${r.status}），不能据此推断没有相关规则。`);
      const body = await r.text();
      if (body.length > 4_000_000) throw new Error('赛事页面过大，请提供更具体的子页面。');
      const data = JSON.parse(body), result = extractPage(data, target.url, section);
      if (cache.size >= 20) cache.delete(cache.keys().next().value);
      cache.set(target.page, { data, source: result.source, until: Date.now() + 900000 });
      return result;
    },
  };
}
