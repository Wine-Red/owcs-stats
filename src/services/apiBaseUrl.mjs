const VISUALIZE_PATH_PATTERN = /^\/visualize(?:\/|$)/;

export const isPublicVisualizePath = (pathname) => (
  VISUALIZE_PATH_PATTERN.test(String(pathname || ''))
);

export const resolveRuntimeApiBaseUrl = (pathname) => (
  isPublicVisualizePath(pathname) ? '/public-api' : '/api'
);
