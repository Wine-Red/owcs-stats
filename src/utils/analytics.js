import analyticsConfig from '../config/analytics';
import { isDisplayPackage } from '../services/packageMode.mjs';
import { EVENTS } from '../analytics/catalog.mjs';
import { apiResource, campaignQuery, classifyError, createTransport, enrichContext, eventData, pageInfo, pagePath, routeContext, safeReferrer, shouldCollect, snapshotRoute, visitKey } from '../analytics/core.mjs';
const SCRIPT_ID = 'owcs-umami-script';
const contexts = new Map(), exposures = new Set(), debugRecords = [];
const navigationListeners = new Set();
let getState = () => ({}), getRoute = () => ({ path: window.location.pathname });
let previousVisit = '', referrer = '', campaign = '', initialized = false;
const env = import.meta.env;
const debug = env.VITE_ANALYTICS_DEBUG === 'true';
const scriptUrl = env.VITE_UMAMI_SCRIPT_URL || analyticsConfig.umamiScriptUrl;
const websiteId = env.VITE_UMAMI_WEBSITE_ID || analyticsConfig.umamiWebsiteId;
export const getAnalyticsPageKey = route => pageInfo(route || getRoute(), env.BASE_URL)?.key || null;
export const getAnalyticsPageLabel = route => pageInfo(route || getRoute(), env.BASE_URL)?.label || '';
export const isPublicAnalyticsRoute = route => Boolean(getAnalyticsPageKey(route));
export const getAnalyticsVisitKey = () => previousVisit;
export function onAnalyticsNavigation(listener) {
  navigationListeners.add(listener);
  return () => navigationListeners.delete(listener);
}
export const isAnalyticsEnabled = () => {
  if (typeof window === 'undefined' || isDisplayPackage || !scriptUrl || !websiteId || env.VITE_ANALYTICS_ENABLED === 'false') return false;
  try { if (window.localStorage.getItem('umami.disabled')) return false; } catch { /* WebViews can disable storage. */ }
  return shouldCollect({ production: env.PROD, displayPackage: isDisplayPackage, override: env.VITE_ANALYTICS_ENABLED, hostname: window.location.hostname });
};
const transport = createTransport({ getTracker: () => window.umami, enabled: isAnalyticsEnabled,
  debug: debug ? payload => { debugRecords.push(payload); if (debugRecords.length > 200) debugRecords.shift(); } : undefined });
export function registerAnalyticsContext(route, getter) {
  const token = Symbol('page-context');
  contexts.set(token, { path: route.path, getter });
  return () => contexts.delete(token);
}
export function buildRoutePayload(route = getRoute(), payload = {}) {
  const current = [...contexts.values()].filter(item => item.path === route.path).at(-1);
  let pageContext = {};
  try { pageContext = current?.getter() || {}; } catch { /* A transitioning page can be incomplete. */ }
  const context = { ...routeContext(route), ...pageContext };
  // A navigation target must not inherit a source entity's readable name.
  for (const entity of ['season', 'match', 'team', 'player', 'map', 'hero']) {
    if (payload[`${entity}Id`] !== undefined && String(payload[`${entity}Id`]) !== String(context[`${entity}Id`])) delete context[`${entity}Name`];
  }
  return { ...context, ...payload };
}
export function captureAnalyticsContext(route = getRoute(), payload = {}) {
  return { route: snapshotRoute(route), data: enrichContext(buildRoutePayload(route, payload), getState()), referrer };
}
export function trackPublicEvent(key, data = {}, route = getRoute()) {
  try {
    const captured = route?.route && route?.data ? route : null;
    const target = captured?.route || route, page = pageInfo(target, env.BASE_URL);
    const input = captured ? { ...captured.data, ...data } : buildRoutePayload(target, data);
    const payload = eventData(key, { source: page?.label, ...input }, getState(), page, env.PROD ? '正式站' : '本地调试');
    if (!payload) { if (debug) console.warn('[Analytics] Unregistered event or nonpublic page:', key); return false; }
    return transport.send({ name: EVENTS[key].name, data: payload, url: pagePath(target, env.BASE_URL), title: `${page.label} · OWCS Stats`, referrer: captured?.referrer ?? referrer });
  } catch { return false; }
}
export const trackEvent = trackPublicEvent;
export function trackPerformance(metric, duration, data = {}, route) {
  if (!Number.isFinite(duration) || duration < 0) return false;
  return trackPublicEvent('page_load', { ...data, metric, duration: Math.round(duration) }, route);
}
const recentErrors = new Map();
export function trackError(source, error, data = {}, route = getRoute()) {
  if (error?.code === 'ERR_CANCELED') return false;
  const key = `${visitKey(route?.route || route)}:${apiResource(error?.config?.url)}:${error?.response?.status || 0}`;
  if (Date.now() - (recentErrors.get(key) || 0) < 10000) return false;
  if (recentErrors.size > 100) recentErrors.clear();
  recentErrors.set(key, Date.now());
  return trackPublicEvent('api_error', { ...data, resource: apiResource(error?.config?.url), method: String(error?.config?.method || 'GET').toUpperCase(), status: error?.response?.status, errorType: classifyError(error) }, route);
}
export function trackFeatureView(data) {
  const key = JSON.stringify([previousVisit, data.seasonId || buildRoutePayload().seasonId, data.feature, data.mapGameId, data.matchId, data.exposureKey]);
  if (exposures.has(key)) return;
  exposures.add(key);
  trackPublicEvent('feature_view', data);
}
export function initAnalytics({ router, store } = {}) {
  if (typeof window === 'undefined' || initialized || isDisplayPackage) return false;
  initialized = true;
  if (store) getState = () => store.state;
  if (router) getRoute = () => router.currentRoute.value;
  referrer = safeReferrer(document.referrer, window.location.origin);
  campaign = campaignQuery(window.location.search);
  if (debug) window.__OWCS_ANALYTICS__ = { records: debugRecords, clear: () => { debugRecords.length = 0; }, flush: transport.flush };
  const onRoute = (to, from, failure) => {
    if (failure) return;
    const key = visitKey(to);
    if (key === previousVisit) return;
    previousVisit = key;
    exposures.clear(); recentErrors.clear();
    navigationListeners.forEach(listener => listener());
    const page = pageInfo(to);
    if (!page) return;
    if (pageInfo(from)) referrer = from.path;
    transport.send({ url: `${to.path}${campaign}`, title: `${page.label} · OWCS Stats`, referrer });
    campaign = '';
  };
  router?.afterEach(onRoute);
  if (router?.currentRoute.value.matched.length) onRoute(router.currentRoute.value, {});
  if (!isAnalyticsEnabled()) return false;
  if (document.getElementById(SCRIPT_ID)) { transport.flush(); return true; }
  const script = document.createElement('script');
  script.id = SCRIPT_ID; script.defer = true; script.src = scriptUrl;
  script.setAttribute('data-website-id', websiteId);
  script.setAttribute('data-auto-track', 'false');
  script.setAttribute('data-exclude-search', 'true');
  script.setAttribute('data-exclude-hash', 'true');
  script.onload = transport.flush; script.onerror = transport.clear;
  document.head.appendChild(script);
  return true;
}
