/* global globalThis */
import { computed, onMounted, onUnmounted, reactive, unref, watch } from 'vue';

const baseURL = import.meta.env.VITE_POLL_API_BASE_URL
  || (import.meta.env.MODE === 'static' ? 'https://stats.owmini.xyz/poll-api' : '/poll-api');
const tokenKey = 'owcs_vote_visitor_v1';
const state = reactive({});
const pending = new Map();
let visitorPromise;

const readToken = () => {
  try { return globalThis.localStorage.getItem(tokenKey) || ''; } catch { return ''; }
};
const request = async (path, body) => {
  const token = readToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${baseURL.replace(/\/$/, '')}${path}`, {
      method: body ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Vote-Token': token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || '暂时无法获取支持率'), { status: response.status });
    return result;
  } finally { clearTimeout(timeout); }
};
export const getLiveUpcomingMatches = () => request('/upcoming');

const ensureVisitor = async () => {
  if (readToken()) return;
  if (!visitorPromise) visitorPromise = (async () => {
    // Verify persistence before issuing an identity: ephemeral WebViews must not
    // silently create a different visitor on every click.
    try { globalThis.localStorage.setItem(tokenKey, ''); }
    catch { throw new Error('当前页面无法保存投票身份，请在允许本地存储的浏览器中打开'); }
    const { token } = await request('/visitor', {});
    globalThis.localStorage.setItem(tokenKey, token);
  })().finally(() => { visitorPromise = null; });
  return visitorPromise;
};

export const useMatchPolls = season => {
  const seasonId = computed(() => String(unref(season) || ''));
  const entry = computed(() => state[seasonId.value] || { sources: {}, matches: {}, error: '', loading: true });
  const refresh = async (force = false) => {
    const id = seasonId.value;
    if (!/^\d+$/.test(id)) return;
    if (pending.has(id)) return pending.get(id);
    if (!force && state[id]?.fetchedAt > Date.now() - 15000) return;
    const task = request(`/summary?seasonId=${id}`).then(result => {
      state[id] = { ...result, error: '', loading: false, fetchedAt: Date.now() };
    }).catch(error => {
      state[id] = { ...(state[id] || { sources: {}, matches: {} }), error: error.message, loading: false, fetchedAt: Date.now() };
    }).finally(() => pending.delete(id));
    pending.set(id, task);
    return task;
  };
  const vote = async (summary, teamId) => {
    await ensureVisitor();
    const id = seasonId.value;
    try {
      const result = await request('/vote', { seasonId: id, sourceId: summary.sourceId, teamId,
        team1Id: summary.team1Id, team2Id: summary.team2Id });
      // Do not let an older in-flight refresh overwrite a successful vote.
      if (pending.has(id)) await pending.get(id);
      state[id] = { ...result, error: '', loading: false, fetchedAt: Date.now() };
    } catch (error) {
      if (error.status === 401) globalThis.localStorage.removeItem(tokenKey);
      await refresh(true);
      throw error;
    }
  };
  let timer;
  const onVisible = () => { if (document.visibilityState === 'visible') refresh(true); };
  watch(seasonId, () => refresh(), { immediate: true });
  onMounted(() => {
    timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
    document.addEventListener('visibilitychange', onVisible);
  });
  onUnmounted(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); });
  return { entry, refresh, vote };
};
