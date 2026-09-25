import { getAnalyticsVisitKey, onAnalyticsNavigation, trackFeatureView } from '../utils/analytics';
// One continuous second in the viewport. Mounting a component is not an exposure.
export const analyticsView = {
  mounted(el, binding) {
    if (typeof IntersectionObserver === 'undefined') return;
    const state = { value: binding.value, visible: false, timer: null };
    const cancel = () => { clearTimeout(state.timer); state.timer = null; };
    const schedule = () => {
      cancel();
      if (!state.visible || document.hidden || !state.value?.feature) return;
      const visit = getAnalyticsVisitKey();
      state.timer = setTimeout(() => {
        if (!document.hidden && el.getClientRects().length && visit === getAnalyticsVisitKey()) trackFeatureView(state.value);
      }, 1000);
    };
    const observer = new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; schedule(); }, { threshold: 0 });
    observer.observe(el);
    const unsubscribe = onAnalyticsNavigation(schedule);
    document.addEventListener('visibilitychange', schedule);
    el.__analyticsView = { state, schedule, cleanup: () => { cancel(); unsubscribe(); observer.disconnect(); document.removeEventListener('visibilitychange', schedule); } };
  },
  updated(el, binding) {
    const instance = el.__analyticsView;
    if (!instance || JSON.stringify(instance.state.value) === JSON.stringify(binding.value)) return;
    instance.state.value = binding.value; instance.schedule();
  },
  unmounted(el) { el.__analyticsView?.cleanup(); delete el.__analyticsView; },
};
