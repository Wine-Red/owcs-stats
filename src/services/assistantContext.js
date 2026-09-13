import { computed, onUnmounted, shallowReactive, watch } from 'vue';
import { useRoute } from 'vue-router';

export const assistantEnabled = import.meta.env.MODE === 'assistant';
const contexts = shallowReactive(new Map());
const ids = value => [...new Set((value || []).map(Number).filter(x => Number.isSafeInteger(x) && x > 0))].slice(0, 10);
export function cleanPage(value) {
  const result = { ...value, team_ids: ids(value.team_ids), player_ids: ids(value.player_ids) };
  for (const key of ['competition_id', 'match_id', 'game_id', 'map_id', 'hero_id', 'stage_id']) {
    const n = Number(result[key]);
    if (Number.isSafeInteger(n) && n > 0) result[key] = n;
    else delete result[key];
  }
  return result;
}

// Each visible page/chart owns an entry. Unmounting an old transition must not
// clear the new page, and hidden tabs must never override the active chart.
export function useAssistantContext(getter, { chart = false } = {}) {
  if (!assistantEnabled) return;
  const route = useRoute(), token = Symbol('assistant-context'), ownerPath = route.path;
  const stop = watch(getter, data => {
    contexts.set(token, { path: ownerPath, data, chart });
  }, { deep: true, immediate: true });
  onUnmounted(() => { stop(); contexts.delete(token); });
}

export function useCurrentAssistantPage() {
  const route = useRoute();
  return computed(() => {
    const current = [...contexts.values()].filter(x => x.path === route.path);
    const kind = { Visualize: 'competition', MatchDetail: 'match', PlayerDetail: 'player', TeamDetail: 'team', UpcomingMatchDetail: 'upcoming' }[route.name] || 'general';
    const fallback = { kind, label: '当前页面', loading: true,
      competition_id: route.query.seasonId, match_id: route.query.matchId,
      team_ids: route.query.teamId ? [route.query.teamId] : [],
      player_ids: route.query.playerId ? [route.query.playerId] : [] };
    const base = current.filter(x => !x.chart).at(-1)?.data || fallback;
    const chart = current.filter(x => x.chart && x.data?.for_tab === base.tab).at(-1)?.data;
    const { for_tab, ...extra } = chart || {};
    return cleanPage({ ...base, ...extra });
  });
}
