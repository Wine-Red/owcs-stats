import { tool } from 'ai';
import { z } from 'zod';
import { analysisSchema, analyze } from './analysis.js';
import { timelineInput, projectTimeline } from './timeline.js';

const id = z.coerce.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期用 YYYY-MM-DD');
const filters = z.object({
  competition_id: id.optional(), stage_id: id.optional(), team_id: id.optional(),
  opponent_id: id.optional(), player_id: id.optional(), map_id: id.optional(),
  date_from: date.optional(), date_to: date.optional(),
}).strict();
const scopeSchema = filters.extend({
  match_ids: z.array(id).max(100).optional(), game_id: id.optional(),
  player_ids: z.array(id).max(10).optional(),
  team_ids: z.array(id).max(10).optional(),
  role: z.enum(['tank', 'damage', 'support']).optional(),
}).strict();
const analysisInput = z.object({
  scope_mode: z.enum(['page', 'custom']).default('page').describe('page 使用当前页面对象；custom 完全使用 scope，适合全赛季或追问之前页面'),
  scope: scopeSchema.default({}).describe('明确条件覆盖当前页；扩大到全赛季请用 custom，避免保留当前比赛'),
  metrics: z.array(analysisSchema.shape.metric).min(1).max(15).describe('必填，仅列出问题需要的指标。整局用 damage/eliminations 等；usage_seconds、death_events、ultimate_ready_events 仅用于英雄明细，不能混入整局指标比较。'),
  group_by: analysisSchema.shape.group_by.default(['player']),
  operation: analysisSchema.shape.operation,
  min_samples: analysisSchema.shape.min_samples,
  limit: analysisSchema.shape.limit,
  hero_id: id.optional(), include_conflicts: z.boolean().default(false),
}).strict();

// Public datasets only; bounded process-local cache, never conversation storage.
const datasetCache = new Map();
export function clearDatasets() { datasetCache.clear(); }
export function pageScope(page) {
  return {
    ...(page.competition_id ? { competition_id: page.competition_id } : {}),
    ...(page.match_id ? { match_ids: [page.match_id] } : {}),
    ...(page.game_id ? { game_id: page.game_id } : {}),
    ...(page.map_id ? { map_id: page.map_id } : {}),
    ...(page.team_ids?.length === 1 ? { team_id: page.team_ids[0] } : {}),
    ...(page.team_ids?.length > 1 ? { team_ids: page.team_ids } : {}),
    ...(page.player_ids?.length ? { player_ids: page.player_ids } : {}),
    ...(page.stage_id ? { stage_id: page.stage_id } : {}),
    ...(page.role ? { role: page.role } : {}),
  };
}

export function createTools({ client, wiki, page, signal, emit = () => {} }) {
  const sources = new Map();
  const remember = result => {
    sources.set(result.url, { url: result.url, observed_at: result.observedAt });
    return { url: result.url, observed_at: result.observedAt };
  };
  const read = async (path, params = {}) => {
    const r = await client.get(path, params, signal);
    remember(r);
    return r;
  };
  async function load(scope) {
    const { match_ids, game_id, player_ids, team_ids, role, ...query } = scope;
    // The public API accepts one player/team per request. Union their filtered
    // match lists before loading details, rather than scanning the whole site.
    const queries = !query.player_id && player_ids?.length
      ? [...new Set(player_ids)].sort((a, b) => a - b).map(player_id => ({ ...query, player_id }))
      : !query.team_id && team_ids?.length
        ? [...new Set(team_ids)].sort((a, b) => a - b).map(team_id => ({ ...query, team_id }))
        : [query];
    const cacheKey = JSON.stringify([client.baseUrl, match_ids?.length ? [] : queries.map(q => Object.entries(q).sort()), match_ids?.slice().sort()]);
    const cached = datasetCache.get(cacheKey);
    if (cached && cached.until > Date.now()) {
      for (const s of cached.sources) sources.set(s.url, s);
      return structuredClone(cached.data);
    }
    const started_at = new Date().toISOString();
    let matches = [];
    if (match_ids?.length) {
      for (const matchId of [...new Set(match_ids)]) matches.push((await read(`/matches/${matchId}`)).body.data);
    } else {
      const combined = new Map();
      for (const selection of queries) {
        let cursor;
        const seen = new Set(), cursors = new Set();
        do {
          const r = await read('/matches', { ...selection, limit: 100, ...(cursor ? { cursor } : {}) });
          for (const m of r.body.data) {
            if (seen.has(m.id)) throw new Error('读取中出现重复比赛；数据可能正在更新，请稍后重新查询。');
            seen.add(m.id);
            if (combined.has(m.id) && JSON.stringify(combined.get(m.id)) !== JSON.stringify(m))
              throw new Error('读取期间比赛记录发生变化，请重新查询。');
            combined.set(m.id, m);
          }
          if (combined.size > 300)
            throw new Error('所选对象范围超过 300 场比赛，请按赛事或日期拆分；没有将部分样本作为全量。');
          cursor = r.body.pagination.next_cursor;
          if (cursor && cursors.has(cursor)) throw new Error('赛事接口返回重复分页游标，已停止统计。');
          if (cursor) cursors.add(cursor);
        } while (cursor);
      }
      matches = [...combined.values()];
    }
    const bundles = [], dataSources = [];
    // Small bounded concurrency hides network latency while the API client
    // retains its global request cadence and upstream rate-limit handling.
    let next = 0, finished = 0, failure;
    await Promise.all(Array.from({ length: Math.min(3, matches.length) }, async () => {
      while (next < matches.length && !failure) {
        const index = next++, match = matches[index];
        try {
          const r = await read(`/matches/${match.id}/data`);
          if (JSON.stringify(r.body.data.match) !== JSON.stringify(match)) throw new Error('读取期间比赛记录发生变化，请重新查询。');
          bundles[index] = { ...r.body.data, source: r.url };
          dataSources.push(remember(r));
          if (++finished % 10 === 0) emit({ type: 'status', text: `已读取 ${finished}/${matches.length} 场比赛` });
        } catch (e) { failure = e; }
      }
    }));
    if (failure) throw failure;
    const data = { bundles, filters: scope, period: { started_at, finished_at: new Date().toISOString() } };
    const bytes = JSON.stringify(data).length;
    if (bytes < 12_000_000) {
      while (datasetCache.size && (datasetCache.size >= 8 || [...datasetCache.values()].reduce((s, x) => s + x.bytes, 0) + bytes > 32_000_000))
        datasetCache.delete(datasetCache.keys().next().value);
      datasetCache.set(cacheKey, { data: structuredClone(data), sources: dataSources, bytes, until: Date.now() + 60000 });
    }
    return data;
  }
  const wrap = (name, description, inputSchema, execute) => tool({
    description, inputSchema,
    execute: async input => {
      const started = Date.now();
      emit({ type: 'status', text: {
        lookup: '正在查找赛事资料', list_matches: '正在查找比赛', read_match: '正在读取这场比赛',
        competition_info: '正在核对赛事信息', analyze_stats: '正在比较数据', read_liquipedia: '正在查阅赛事规则', read_timeline: '正在读取地图时间线',
      }[name] });
      try {
        const result = await execute(input);
        emit({ type: 'tool_result', name, elapsed_ms: Date.now() - started,
          ...(name === 'analyze_stats' ? { analyses: result.analyses } : {}) });
        return result;
      } catch (error) {
        if (signal?.aborted) throw error;
        const result = { error: { code: error.code || 'QUERY_ERROR', message: error.message,
          ...(error.issues ? { fields: error.issues.map(x => ({ field: x.path.join('.'), message: x.message })) } : {}) } };
        emit({ type: 'tool_result', name, elapsed_ms: Date.now() - started, error: result.error });
        return result;
      }
    },
  });
  const tools = {
    lookup: wrap('lookup', '按名称或别名查赛事、队伍、选手、地图、英雄，获取准确 ID。已有 ID 可直接读取。没有名称时列目录。', z.object({
      kind: z.enum(['competitions', 'teams', 'players', 'maps', 'heroes']),
      name: z.string().max(150).optional(), id: id.optional(), cursor: z.string().max(2000).optional(),
    }).strict(), async ({ kind, name, id, cursor }) => {
      const r = await read(`/${kind}${id ? '/' + id : ''}`, id ? {} : { ...(name ? { q: name } : {}), ...(cursor ? { cursor } : {}), limit: 30 });
      if (kind === 'competitions' && name && !id && !cursor && !r.body.data.length) {
        const directory = await read('/competitions', { limit: 100 });
        return { ...r.body, source: remember(r), candidates: directory.body.data,
          candidate_pagination: directory.body.pagination, candidate_source: remember(directory),
          note: '名称搜索未匹配，不能据此断言赛事不存在。目录可能使用英文名或简称，请从候选赛事匹配；仍有分页时用 lookup 的 cursor 继续读取。' };
      }
      return { ...r.body, source: remember(r) };
    }),
    list_matches: wrap('list_matches', '按赛事、队伍、选手、地图或日期找比赛。返回一页，more=true 表示仍有记录；需要全量统计直接用 analyze_stats。', z.object({
      filters: filters.default({}), cursor: z.string().max(2000).optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
    }).strict(), async ({ filters, cursor, limit }) => {
      const r = await read('/matches', { ...filters, limit, ...(cursor ? { cursor } : {}) });
      return { ...r.body, source: remember(r), more: !!r.body.pagination.next_cursor };
    }),
    read_match: wrap('read_match', '读取比赛结果、地图和覆盖情况。game_id 可选，用于查看一局的选手原始指标。事件先后、回合、英雄切换和大招使用请用 read_timeline；多个指标排名或比较用 analyze_stats。', z.object({
      match_id: id, game_id: id.optional(),
    }).strict(), async ({ match_id, game_id }) => {
      const r = await read(`/matches/${match_id}/data`), b = r.body.data;
      if (game_id && !b.games.some(x => x.game.id === game_id)) throw new Error('该地图局不属于这场比赛。');
      return { match: b.match, result_consistency: b.result_consistency, source: remember(r),
        games: b.games.filter(g => !game_id || g.game.id === game_id).map(g => ({
          ...g.game,
          ...(game_id ? { players: g.player_stats.map(p => ({ player: p.player, team: p.team, metrics: p.metrics })) } : {}),
        })), timeline_access: '此结果只含记分板。每张地图都可以用 read_timeline 查询时间线；缺少时间线字段不表示没有事件数据。' };
    }),
    read_timeline: wrap('read_timeline', '读取一张地图的回合、比赛阶段、英雄选择/切换、最终一击、死亡标记、大招就绪及使用事件。省略比赛和地图局编号使用当前页；明确查另一图时先 read_match 获取地图编号。默认所有回合、仅已确认事件；可按回合/选手/事件类型/时间筛选。计数覆盖全部匹配记录，事件明细分页，继续时带回 snapshot 和 next_offset。时间每回合归零。', timelineInput, async args => {
      const input = timelineInput.parse(args);
      const matchId = input.match_id ?? page.match_id;
      const gameId = input.game_id ?? (matchId === page.match_id ? page.game_id : undefined);
      if (!matchId) throw new Error('先查明比赛，或使用当前比赛页，再调用 read_timeline。');
      const r = await read(`/matches/${matchId}/data`), bundle = r.body.data;
      const selected = gameId ? bundle.games.find(g => g.game.id === gameId)
        : bundle.games.length === 1 ? bundle.games[0] : null;
      if (!selected) throw new Error('请从这场比赛的地图列表选择一张地图，不能猜测或读取其他比赛的地图局。');
      if (!client.getTimeline) throw new Error('尚未配置时间线读取适配器，不能据此声称比赛没有时间线。');
      const timeline = await client.getTimeline(selected.game.id, signal);
      const result = projectTimeline(timeline.body, selected.game, selected.player_stats, input);
      return { ...result, sources: [remember(r), remember(timeline)] };
    }),
    competition_info: wrap('competition_info', '读取赛事阶段、参赛队伍、指定队伍名单或数据覆盖。名单不等于比赛出场。', z.object({
      competition_id: id, kind: z.enum(['stages', 'teams', 'roster', 'coverage']), team_id: id.optional(),
    }).strict(), async ({ competition_id, kind, team_id }) => {
      if (kind === 'roster' && !team_id) throw new Error('读取名单需要 team_id；先查 teams 获取 ID。');
      const r = await read(`/competitions/${competition_id}/${kind === 'roster' ? `teams/${team_id}/players` : kind}`);
      return { ...r.body, source: remember(r) };
    }),
    analyze_stats: wrap('analyze_stats', '一次完成筛选、取数和多个指标的确定性计算。支持当前页或任意明确范围、按最多三维分组、均值/总量/每十分钟/分布/队伍胜率。自动遍历分页，复用短期缓存。', analysisInput, async input => {
      const scope = { ...(input.scope_mode === 'page' ? pageScope(page) : {}), ...input.scope };
      if ((scope.game_id || scope.map_id) && input.metrics.includes('series_win_rate')) throw new Error('当前限定了地图局，请使用 map_win_rate；系列赛胜率需清除地图筛选。');
      if (scope.date_from && scope.date_to && scope.date_from > scope.date_to) throw new Error('开始日期不能晚于结束日期。');
      const dataset = await load(scope);
      dataset.filters = scope;
      const playerIds = scope.player_ids || (scope.player_id ? [scope.player_id] : []);
      // Explicit match IDs can bypass upstream filters; apply every scope field locally too.
      dataset.bundles = dataset.bundles.filter(b =>
        (!scope.competition_id || b.match.competition.id === scope.competition_id) &&
        (!scope.stage_id || b.match.stage?.id === scope.stage_id) &&
        (!scope.date_from || b.match.date >= scope.date_from) && (!scope.date_to || b.match.date <= scope.date_to) &&
        (!scope.team_ids?.length || [b.match.team1.team.id, b.match.team2.team.id].some(id => scope.team_ids.includes(id))) &&
        (!scope.team_id || [b.match.team1.team.id, b.match.team2.team.id].includes(scope.team_id)) &&
        (!scope.opponent_id || [b.match.team1.team.id, b.match.team2.team.id].includes(scope.opponent_id)));
      for (const b of dataset.bundles) {
        b.games = b.games.filter(g => (!scope.game_id || g.game.id === scope.game_id) && (!scope.map_id || g.game.map.id === scope.map_id));
        for (const g of b.games) g.player_stats = g.player_stats.filter(p =>
          (!playerIds.length || playerIds.includes(p.player.id)) && (!scope.role || p.player.role === scope.role));
      }
      if (scope.game_id && !dataset.bundles.some(b => b.games.length)) throw new Error('在当前比赛范围找不到所选地图局，请核对页面或查询范围。');
      if ((playerIds.length || scope.role) && input.metrics.some(x => x.endsWith('_win_rate'))) throw new Error('不能将队伍胜率归因给选手，请清除选手筛选后按队伍比较。');
      const analyses = input.metrics.map(metric => analyze(dataset, {
        dataset_id: 'current', group_by: input.group_by, metric, operation: input.operation,
        team_id: scope.team_id, team_ids: scope.team_ids, map_id: scope.map_id,
        hero_id: input.hero_id ?? (input.scope_mode === 'page' ? page.hero_id : undefined),
        min_samples: input.min_samples, limit: input.limit, include_conflicts: input.include_conflicts,
      }));
      return { scope, analyses, sources: dataset.bundles.map(b => sources.get(b.source)),
        note: '结果覆盖本次完整读取的已收录比赛；接口响应缓存 30 秒、统计数据集缓存 60 秒，以来源读取时间为准，非跨请求原子快照。' };
    }),
    read_liquipedia: wrap('read_liquipedia', '查阅当前赛事配置的 Liquipedia 页面或指定 Overwatch 页面。默认返回章节目录和概要；section 填章节编号进一步读取。用于赛制/晋级/背景，不替代本站选手统计。', z.object({
      url: z.string().max(700).optional(), section: z.string().regex(/^\d+$/).optional(),
    }).strict(), async ({ url, section }) => {
      const result = await wiki.read({ url: url || page.liquipedia_url, competitionId: page.competition_id, section, signal });
      sources.set(result.source.url, result.source);
      return result;
    }),
  };
  return { tools, sources };
}
