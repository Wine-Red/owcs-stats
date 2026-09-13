import { readFileSync } from "node:fs";
import YAML from "yaml";
import Ajv from "ajv/dist/2020.js";
import formats from "ajv-formats";
import { setTimeout as delay } from "node:timers/promises";
import { timelineMapSchema } from "./timeline.js";
const spec = YAML.parse(
  readFileSync(new URL("../../../docs/public-data-api/openapi.yaml", import.meta.url), "utf8"),
);
const ajv = new Ajv({ strict: false, allErrors: false });
formats(ajv);
ajv.addSchema({ $id: "urn:owcs:contract", components: spec.components });
const routes = Object.entries(spec.paths).map(([template, methods]) => ({
  template,
  regex: new RegExp("^" + template.replace(/\{[^}]+\}/g, "[1-9][0-9]*") + "$"),
  operation: methods.get,
}));
const validators = new Map();
export class DataError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}
export function createDataClient({
  baseUrl = "https://stats.owmini.xyz/data/v1",
  fetcher = fetch,
  interval = 350,
  ttlMs = 30000,
  displayBaseUrl,
} = {}) {
  const root = new URL(baseUrl);
  if (
    !/^https?:$/.test(root.protocol) ||
    root.search ||
    root.hash ||
    root.username ||
    root.password
  )
    throw new Error("Invalid data origin");
  const displayRoot = new URL(displayBaseUrl || '/public-api', root);
  if (!/^https?:$/.test(displayRoot.protocol) || displayRoot.search || displayRoot.hash || displayRoot.username || displayRoot.password)
    throw new Error('Invalid display data origin');
  let nextRequest = 0;
  const cache = new Map();
  async function get(resource, params = {}, signal) {
    const route = routes.find((r) => r.regex.test(resource));
    if (!route)
      throw new DataError("INVALID_PATH", "仅支持 /data/v1 契约中的资源路径");
    const url = new URL(root.href.replace(/\/$/, "") + resource);
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined) url.searchParams.set(k, String(v));
    }
    if (!validators.has(route.template)) {
      const schema = route.operation.responses["200"].content["application/json"].schema;
      validators.set(route.template, ajv.compile(JSON.parse(JSON.stringify(schema).replaceAll('"#/', '"urn:owcs:contract#/'))));
    }
    return readUrl(url, validators.get(route.template), signal);
  }
  async function getTimeline(gameId, signal) {
    if (!Number.isSafeInteger(gameId) || gameId < 1) throw new DataError('INVALID_PATH', '地图局编号无效');
    const url = new URL(displayRoot.href.replace(/\/$/, '') + `/map-games/${gameId}`);
    const result = await readUrl(url, body => timelineMapSchema.safeParse(body).success, signal);
    return { ...result, body: timelineMapSchema.parse(result.body) };
  }
  async function readUrl(url, validate, signal) {
    signal?.throwIfAborted();
    const cached = cache.get(url.href);
    if (cached && Date.now() - Date.parse(cached.observedAt) < ttlMs)
      return { ...cached, cache_hit: true };
    const wait = Math.max(0, nextRequest - Date.now());
    nextRequest = Math.max(Date.now(), nextRequest) + interval;
    if (wait) await delay(wait, undefined, { signal });
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetcher(url, {
          headers: {
            accept: "application/json",
            ...(cached?.etag ? { "if-none-match": cached.etag } : {}),
          },
          redirect: "error",
          signal: AbortSignal.any([
            signal || new AbortController().signal,
            AbortSignal.timeout(20000),
          ]),
        });
      } catch (e) {
        if (signal?.aborted) throw e;
        throw new DataError(
          "UPSTREAM_UNAVAILABLE",
          "赛事接口连接失败；这不表示没有比赛记录。",
        );
      }
      if (![429, 503].includes(response.status) || attempt === 2) break;
      const retry = Number(response.headers.get("retry-after") || 2);
      await response.body?.cancel();
      if (retry > 15)
        throw new DataError(
          "RATE_LIMITED",
          `赛事接口限流，请在 ${retry} 秒后重试。`,
        );
      await delay(Math.max(1, retry) * 1000 * (attempt + 1), undefined, {
        signal,
      });
    }
    const observedAt = new Date().toISOString();
    if (response.status === 304 && cached) {
      const result = { ...cached, observedAt, revalidated: true };
      cache.set(url.href, result);
      return result;
    }
    if (!response.ok) {
      const code =
        {
          400: "INVALID_QUERY",
          404: "NOT_FOUND",
          410: "CURSOR_EXPIRED",
          429: "RATE_LIMITED",
          503: "DATA_UNAVAILABLE",
        }[response.status] || "UPSTREAM_ERROR";
      await response.body?.cancel();
      throw new DataError(
        code,
        `赛事接口返回 ${response.status}；不能把错误解释为零或空集合。`,
        { url: url.href, requestId: response.headers.get("x-request-id") },
      );
    }
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new DataError(
        "INVALID_RESPONSE",
        "赛事接口没有返回 JSON，可能被登录页或网关拦截。",
      );
    const text = await response.text();
    if (text.length > 8_000_000)
      throw new DataError("TOO_LARGE", "单次数据响应过大，请缩小范围。");
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new DataError("INVALID_RESPONSE", "赛事接口 JSON 损坏。");
    }
    if (!validate(body))
      throw new DataError(
        "CONTRACT_MISMATCH",
        "赛事响应不符合数据契约，已停止使用该响应。",
        { path: url.pathname },
      );
    const result = {
      body,
      url: url.href,
      observedAt,
      etag: response.headers.get("etag"),
      requestId: response.headers.get("x-request-id"),
    };
    if (cache.size >= 80) cache.delete(cache.keys().next().value);
    cache.set(url.href, result);
    return result;
  }
  return {
    get,
    getTimeline,
    baseUrl: root.href,
    clear() {
      cache.clear();
    },
  };
}
