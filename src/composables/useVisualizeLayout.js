import { ref, onMounted, onUnmounted } from 'vue';
import { COMPACT_VISUALIZE_MEDIA_QUERY } from '@/utils/visualizeLayout';

// The same query drives CSS, chart geometry and desktop table density.
export function useWideVisualizeLayout() {
  const media = typeof window === 'undefined' ? null : window.matchMedia(COMPACT_VISUALIZE_MEDIA_QUERY);
  const isWideLayout = ref(media ? !media.matches : false);
  const sync = () => { isWideLayout.value = !media.matches; };
  onMounted(() => media?.addEventListener('change', sync));
  onUnmounted(() => media?.removeEventListener('change', sync));
  return isWideLayout;
}
