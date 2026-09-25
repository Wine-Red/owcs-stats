import { onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { registerAnalyticsContext, trackPublicEvent } from '../utils/analytics';
// Getters are read at action time. Reactive initialization sends no events.
export function useAnalyticsContext(getter) {
  const dispose = registerAnalyticsContext(useRoute(), getter);
  onUnmounted(dispose);
}
export function useFeatureAnalytics(feature, getContext = () => ({})) {
  const route = useRoute();
  return (key, data = {}) => trackPublicEvent(key, { feature, source: feature, ...getContext(), ...data }, route);
}
