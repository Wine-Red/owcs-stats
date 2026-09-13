import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.number().int().positive();
const key = z.union([z.string().max(160), z.number()]).transform(String);
const optionalKey = key.nullish();
const ms = z.number().finite().nonnegative();
const name = z.string().max(200).nullish();
const confidence = z.number().min(0).max(1).nullish();
const eventSchema = z.object({
  type: z.string().min(1).max(80), timeMs: ms, roundId: optionalKey,
  playerId: optionalKey, killerId: optionalKey, victimId: optionalKey,
  heroName: name, previousHeroName: name, status: z.string().max(40).nullish(), confidence,
});
// This is a narrow adapter for the existing public display endpoint. Zod strips
// source tasks, evidence images, filesystem paths and all unrelated fields.
export const timelineMapSchema = z.object({
  id, matchId: id, mapId: id, team1Id: id, team2Id: id,
  timeline: z.object({
    revision: id,
    payload: z.object({
      schemaVersion: z.union([z.literal(1), z.literal(2)]),
      timebase: z.object({ kind: z.string(), nonGameplay: name, segmentJoin: name }).nullish(),
      media: z.object({ durationMs: ms }).optional(),
      players: z.array(z.object({ playerId: key, displayName: name, teamSide: z.enum(['A', 'B']).nullish(), role: name, confidence })).max(40),
      rounds: z.array(z.object({ roundId: key, index: id, startMs: ms, endMs: ms, durationMs: ms.optional() })).max(40).default([]),
      phases: z.array(z.object({ kind: z.string().max(80), roundId: optionalKey, startMs: ms, endMs: ms, confidence })).max(200).default([]),
      events: z.array(eventSchema).max(20000),
    }),
  }).nullable(),
});

export const timelineInput = z.object({
  match_id: z.coerce.number().int().positive().optional(),
  game_id: z.coerce.number().int().positive().optional(),
  round_number: z.coerce.number().int().positive().optional().describe('回合序号；省略查看整张地图的所有回合'),
  player: z.string().trim().min(1).max(150).optional().describe('选手名称，匹配参与该事件的选手、击杀者或被击杀者'),
  event_types: z.array(z.enum(['kill', 'death', 'hero_selected', 'hero_switch', 'ultimate_ready', 'ultimate_used'])).min(1).max(6).optional(),
  start_seconds: z.coerce.number().finite().nonnegative().optional(),
  end_seconds: z.coerce.number().finite().nonnegative().optional(),
  include_unconfirmed: z.boolean().default(false).describe('默认仅已确认事件；开启时保留待确认状态，始终排除已否决记录'),
  offset: z.coerce.number().int().min(0).max(20000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  snapshot: z.string().regex(/^[a-f0-9]{64}$/).optional().describe('继续分页时原样带回上一页 pagination.snapshot，防止更新导致漏读或重读'),
}).strict();

function invalid(message) { const error = new Error(message); error.code = 'TIMELINE_INVALID'; throw error; }
const lower = text => String(text || '').trim().toLowerCase();
const seconds = value => value / 1000;
const types = ['kill', 'death', 'hero_selected', 'hero_switch', 'ultimate_ready', 'ultimate_used'];
const countTypes = events => Object.fromEntries(types.map(type => [type, events.filter(e => e.type === type).length]));

export function projectTimeline(rawMap, game, playerStats, rawInput) {
  const input = timelineInput.parse(rawInput);
  const map = timelineMapSchema.parse(rawMap);
  if (map.id !== game.id || map.matchId !== game.match_id || map.mapId !== game.map.id
    || map.team1Id !== game.team1.team.id || map.team2Id !== game.team2.team.id)
    invalid('时间线与所查比赛、地图或队伍不一致，已停止使用，不能混入其他地图的数据。');
  const scope = { match_id: game.match_id, game_id: game.id, map: game.map.name, map_number: game.number,
    round_number: input.round_number ?? null, player: input.player ?? null, event_types: input.event_types ?? null,
    start_seconds: input.start_seconds ?? null, end_seconds: input.end_seconds ?? null,
    confirmed_only: !input.include_unconfirmed };
  if (!map.timeline) {
    if (input.offset > 0 || input.snapshot) invalid('时间线在分页期间已移除，请从头重新查询。');
    return { scope, availability: 'not_recorded', events: [], note: '这张地图尚未收录时间线，不能解释为没有发生事件。' };
  }
  const { payload, revision } = map.timeline;
  const roundLocal = payload.schemaVersion === 2 && payload.timebase?.kind === 'round-local';
  if (payload.schemaVersion === 2 && !roundLocal) invalid('不支持的时间线时间基准；不能猜测这些时间属于哪个回合。');
  if (payload.schemaVersion === 1 && payload.timebase?.kind && payload.timebase.kind !== 'media')
    invalid('不支持的旧版时间线时间基准。');
  const snapshot = createHash('sha256').update(JSON.stringify(map)).digest('hex');
  if ((input.offset > 0 && !input.snapshot) || (input.snapshot && input.snapshot !== snapshot))
    invalid('时间线分页缺少快照或读取期间数据已更新，请从 offset=0 重新查询。');
  const rounds = [...payload.rounds].sort((a, b) => a.index - b.index);
  if (new Set(rounds.map(r => r.roundId)).size !== rounds.length || new Set(rounds.map(r => r.index)).size !== rounds.length)
    invalid('时间线包含重复回合，已停止分析。');
  const byRound = new Map(rounds.map(r => [r.roundId, r]));
  if (roundLocal && !rounds.length) invalid('时间线缺少回合定义，不能解释回合内时间。');
  if (input.round_number && !rounds.some(r => r.index === input.round_number)) invalid('这张地图没有所选回合，请使用返回的回合序号。');
  if (input.start_seconds !== undefined && input.end_seconds !== undefined && input.start_seconds > input.end_seconds)
    invalid('开始时间不能晚于结束时间。');
  if (roundLocal && rounds.length > 1 && !input.round_number && (input.start_seconds !== undefined || input.end_seconds !== undefined))
    invalid('这张地图有多个回合，时间每回合归零；按时间筛选时需要指定 round_number。');

  const players = new Map();
  for (const p of payload.players) {
    if (players.has(lower(p.playerId))) invalid('时间线包含重复选手身份，已停止分析。');
    const sideTeam = p.teamSide === 'A' ? game.team1.team : p.teamSide === 'B' ? game.team2.team : null;
    const candidates = playerStats.filter(s => [p.playerId, p.displayName].some(n => lower(n) === lower(s.player.name))
      && (!sideTeam || s.team.id === sideTeam.id));
    const stats = candidates.length === 1 ? candidates[0] : null;
    players.set(lower(p.playerId), { name: stats?.player.name || p.displayName || p.playerId,
      team: sideTeam?.name || stats?.team.name || null, role: stats?.player.role || p.role || null });
  }
  const person = value => value == null ? null : players.get(lower(value));
  let selectedKey;
  if (input.player) {
    const matches = [...players].filter(([key, p]) => key === lower(input.player) || lower(p.name) === lower(input.player));
    if (matches.length !== 1) invalid('无法唯一匹配这张地图的选手，请使用返回的选手姓名。');
    selectedKey = matches[0][0];
  }
  const accepted = [];
  let rejected = 0, unconfirmed = 0;
  for (const e of payload.events) {
    if (e.status === 'rejected') { rejected++; continue; }
    if (e.status !== 'confirmed') { unconfirmed++; if (!input.include_unconfirmed) continue; }
    const round = byRound.get(e.roundId);
    if (roundLocal && !round) invalid('事件引用了不存在的回合，已停止分析。');
    if (round && (e.timeMs < round.startMs || e.timeMs > round.endMs)) invalid('事件时间超出了所属回合，已停止分析。');
    const type = e.type === 'final_blow' ? 'kill' : e.type;
    const participant = (field, value) => value == null ? {} : { [field]: person(value)?.name || null, [`${field}_team`]: person(value)?.team || null };
    const event = { round: round?.index ?? null, time_seconds: seconds(e.timeMs), type,
      ...participant('player', e.playerId), ...participant('killer', e.killerId), ...participant('victim', e.victimId),
      ...(e.heroName ? { hero: e.heroName } : {}), ...(e.previousHeroName ? { previous_hero: e.previousHeroName } : {}),
      status: e.status || 'unknown', confidence: e.confidence ?? null };
    if (input.round_number && event.round !== input.round_number) continue;
    if (selectedKey && ![e.playerId, e.killerId, e.victimId].some(value => value != null && lower(value) === selectedKey)) continue;
    if (input.event_types && !input.event_types.includes(type)) continue;
    if (input.start_seconds !== undefined && event.time_seconds < input.start_seconds) continue;
    if (input.end_seconds !== undefined && event.time_seconds > input.end_seconds) continue;
    accepted.push(event);
  }
  accepted.sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || a.time_seconds - b.time_seconds);
  const page = accepted.slice(input.offset, input.offset + input.limit);
  return { scope, availability: 'recorded', revision,
    timebase: roundLocal ? 'round_local_seconds' : 'media_seconds',
    players: [...players.values()],
    rounds: rounds.filter(r => !input.round_number || r.index === input.round_number).map(r => ({
      number: r.index, start_seconds: seconds(r.startMs), end_seconds: seconds(r.endMs),
      duration_seconds: seconds(r.durationMs ?? r.endMs - r.startMs),
      matching_event_counts: countTypes(accepted.filter(e => e.round === r.index)),
    })),
    phases: payload.phases.filter(p => !input.round_number || byRound.get(p.roundId)?.index === input.round_number).map(p => ({
      round: byRound.get(p.roundId)?.index ?? null, kind: p.kind, start_seconds: seconds(p.startMs), end_seconds: seconds(p.endMs), confidence: p.confidence ?? null,
    })),
    matching_event_counts: countTypes(accepted), events: page,
    pagination: { offset: input.offset, returned: page.length, matching_events: accepted.length,
      has_more: input.offset + page.length < accepted.length,
      next_offset: input.offset + page.length < accepted.length ? input.offset + page.length : null, snapshot },
    coverage: { recorded_events: payload.events.length, rejected_events: rejected, unconfirmed_events: unconfirmed },
    notes: [roundLocal ? '时间每回合从零开始，剔除非比赛片段并拼接；不能当作整张地图或录像的绝对时间。' : '旧版时间线使用媒体时间，不得擅自当作回合内时间。',
      '计数覆盖本次筛选后的全部事件，events 只是当前页。未出现事件不证明未发生；低置信度及待确认记录应保留不确定性。',
      'kill 是最终一击记录，不是记分板淘汰。death 是独立死亡标记，可能与 kill 的受害者重复，不能相加作为死亡总数。',
      'ultimate_ready 是大招就绪，ultimate_used 是使用；事件先后不能单独证明团战胜负、战术因果或占点进度。'],
  };
}
