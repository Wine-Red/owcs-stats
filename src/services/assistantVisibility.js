import { onMounted, onUnmounted, ref, watch } from 'vue';
import { assistantEnabled } from './assistantContext';

// Read the server's shared setting on navigation and when returning to a tab.
// Keep a successful visible state while refreshing so navigation preserves chat.
export function useAssistantVisibility(getPageScope) {
  const visible = ref(false);
  if (!assistantEnabled) return visible;
  let current;
  async function refresh() {
    current?.abort(); current = null;
    if (!getPageScope()) { visible.value = false; return; }
    const controller = new AbortController(); current = controller;
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/assistant/v1/status', {
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      const status = response.ok ? await response.json() : null;
      if (current === controller) visible.value = status?.showInVisualize === true;
    } catch {
      if (current === controller) visible.value = false;
    } finally { clearTimeout(timer); }
  }
  const onFocus = () => { if (!document.hidden && getPageScope()) void refresh(); };
  watch(getPageScope, refresh, { immediate: true });
  onMounted(() => {
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
  });
  onUnmounted(() => {
    current?.abort(); current = null;
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onFocus);
  });
  return visible;
}
