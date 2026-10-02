// Keep this in sync with the compact media queries in the public page styles.
export const COMPACT_VISUALIZE_MEDIA_QUERY = '(max-width: 768px), (min-width: 769px) and (max-width: 1199px) and (orientation: portrait)';

export const isCompactVisualizeLayout = () => typeof window !== 'undefined'
  && window.matchMedia(COMPACT_VISUALIZE_MEDIA_QUERY).matches;
