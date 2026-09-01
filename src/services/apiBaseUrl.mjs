const VISUALIZE_PATH_PATTERN = /^\/visualize(?:\/|$)/;

export const isPublicVisualizePath = (pathname) => (
  VISUALIZE_PATH_PATTERN.test(String(pathname || ''))
);

export const resolveRuntimeApiBaseUrl = (pathname) => (
  isPublicVisualizePath(pathname) ? '/public-api' : '/api'
);

/** Re-evaluate the API boundary after client-side route navigation. */
export const routeRuntimeApiRequest = (config, pathname) => ({
  ...config,
  baseURL: resolveRuntimeApiBaseUrl(pathname)
});
