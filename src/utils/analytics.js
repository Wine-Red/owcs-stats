/**
 * Analytics Service wrapper for Umami
 * https://umami.is/docs/tracker-functions
 */

import analyticsConfig from '@/config/analytics';

const ANALYTICS_SCRIPT_ID = 'owcs-umami-script';

const ANALYTICS_PAGE_LABELS = {
  visualize_home: '首页',
  visualize_match_detail: '比赛详情',
  visualize_team_detail: '战队详情',
  visualize_upcoming_match_detail: '未开赛详情',
};

const getUmamiScriptUrl = () => {
  return analyticsConfig.umamiScriptUrl || import.meta.env.VITE_UMAMI_SCRIPT_URL || '';
};

const getUmamiWebsiteId = () => {
  return analyticsConfig.umamiWebsiteId || import.meta.env.VITE_UMAMI_WEBSITE_ID || '';
};

const getBasePath = () => {
  const basePath = import.meta.env.BASE_URL || '/';
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
};

const normalizePathname = (pathname = '') => {
  const value = String(pathname || '').trim();
  if (!value) return '/';

  const basePath = getBasePath();
  if (!basePath || basePath === '/') return value || '/';

  if (value === basePath) return '/';
  if (value.startsWith(`${basePath}/`)) {
    return value.slice(basePath.length) || '/';
  }

  return value;
};

const sanitizePayload = (payload = {}) => {
  return Object.entries(payload).reduce((acc, [key, value]) => {
    if (value === undefined || value === null || value === '') {
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
};

const logDebug = (type, message, payload) => {
  if (!import.meta.env.DEV) return;
  if (payload !== undefined) {
    console[type](`[Umami] ${message}`, payload);
  } else {
    console[type](`[Umami] ${message}`);
  }
};

const getCurrentPathname = () => {
  if (typeof window === 'undefined') return '/';
  return normalizePathname(window.location.pathname);
};

export const getAnalyticsPageKey = (routeLike) => {
  if (routeLike?.meta?.analyticsPage) {
    return String(routeLike.meta.analyticsPage);
  }

  const rawPath = typeof routeLike === 'string'
    ? routeLike
    : routeLike?.path || routeLike?.fullPath || getCurrentPathname();

  const pathname = normalizePathname(rawPath);

  if (pathname === '/visualize') return 'visualize_home';
  if (pathname === '/visualize/match-detail') return 'visualize_match_detail';
  if (pathname === '/visualize/team-detail') return 'visualize_team_detail';
  if (pathname === '/visualize/upcoming-match') return 'visualize_upcoming_match_detail';

  return null;
};

export const getAnalyticsPageLabel = (routeLike) => {
  const pageKey = getAnalyticsPageKey(routeLike);
  return pageKey ? ANALYTICS_PAGE_LABELS[pageKey] || pageKey : '';
};

export const isPublicAnalyticsRoute = (routeLike) => {
  return Boolean(getAnalyticsPageKey(routeLike));
};

export const buildRoutePayload = (routeLike, payload = {}) => {
  const pageKey = getAnalyticsPageKey(routeLike);
  const routeName = routeLike?.name ? String(routeLike.name) : pageKey || '';
  const basePayload = pageKey
    ? {
        page: getAnalyticsPageLabel(routeLike),
        routeName,
      }
    : {};

  return sanitizePayload({
    ...basePayload,
    ...payload,
  });
};

export const isAnalyticsEnabled = () => {
  return Boolean(getUmamiScriptUrl() && getUmamiWebsiteId());
};

export const initAnalytics = () => {
  if (typeof document === 'undefined') return false;
  if (!isAnalyticsEnabled()) {
    logDebug('info', 'Analytics 未启用，缺少脚本地址或 Website ID');
    return false;
  }

  if (document.getElementById(ANALYTICS_SCRIPT_ID)) {
    return true;
  }

  const script = document.createElement('script');
  script.id = ANALYTICS_SCRIPT_ID;
  script.defer = true;
  script.src = getUmamiScriptUrl();
  script.setAttribute('data-website-id', getUmamiWebsiteId());
  script.onload = () => logDebug('info', 'Umami 脚本已加载');
  script.onerror = () => logDebug('warn', 'Umami 脚本加载失败');
  document.head.appendChild(script);

  return true;
};

/**
 * 记录自定义事件
 * @param {string} eventName 事件名称
 * @param {object} eventData 事件携带的数据
 */
export const trackEvent = (eventName, eventData = {}) => {
  if (typeof window === 'undefined') return false;

  try {
    const payload = sanitizePayload(eventData);
    if (window.umami && typeof window.umami.track === 'function') {
      window.umami.track(eventName, payload);
      return true;
    }

    logDebug('info', `Track Event: ${eventName}`, payload);
    return false;
  } catch (error) {
    logDebug('warn', `记录事件失败: ${eventName}`, error);
    return false;
  }
};

export const trackPublicEvent = (eventName, eventData = {}, routeLike) => {
  if (!isPublicAnalyticsRoute(routeLike)) return false;
  return trackEvent(eventName, buildRoutePayload(routeLike, eventData));
};

/**
 * 记录性能指标
 * @param {string} metricName 指标名称
 * @param {number} duration 耗时（毫秒）
 * @param {object} eventData 额外埋点字段
 * @param {object|string} routeLike 当前路由信息
 */
export const trackPerformance = (metricName, duration, eventData = {}, routeLike) => {
  return trackPublicEvent('公共页-性能指标', {
    ...eventData,
    metric: metricName,
    duration: Math.round(Number(duration) || 0),
  }, routeLike);
};

/**
 * 记录错误/异常
 * @param {string} source 错误来源
 * @param {Error|string} error 错误对象或信息
 * @param {object} eventData 额外埋点字段
 * @param {object|string} routeLike 当前路由信息
 */
export const trackError = (source, error, eventData = {}, routeLike) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const config = error?.config || {};
  const response = error?.response || {};

  return trackPublicEvent('公共页-接口报错', {
    ...eventData,
    source,
    url: config.url,
    method: config.method ? String(config.method).toUpperCase() : undefined,
    status: response.status,
    message: errorMessage,
  }, routeLike);
};

export default {
  initAnalytics,
  isAnalyticsEnabled,
  isPublicAnalyticsRoute,
  getAnalyticsPageKey,
  getAnalyticsPageLabel,
  buildRoutePayload,
  trackEvent,
  trackPublicEvent,
  trackPerformance,
  trackError,
};
