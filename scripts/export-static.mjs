import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fetchJsonWithRetry } from './lib/fetch-json-with-retry.mjs';

const projectRoot = process.cwd();
const exportConfigPath = path.join(projectRoot, 'static-export.config.json');
const exportConfig = JSON.parse(await readFile(exportConfigPath, 'utf8'));
const productionMode = process.argv.includes('--production');
const configuredApiBase = productionMode
  ? process.env.OWCS_PRODUCTION_API_BASE || exportConfig.productionApiBase
  : process.env.OWCS_EXPORT_API_BASE || 'http://localhost:3000/api';

if (productionMode && !configuredApiBase) {
  throw new Error('生产导出必须设置 OWCS_PRODUCTION_API_BASE，例如 https://stats.example.com/api');
}

const API_BASE = String(configuredApiBase).replace(/\/$/, '');
const apiUrl = new URL(API_BASE);
if (!['http:', 'https:'].includes(apiUrl.protocol)) {
  throw new Error(`不支持的 API 协议: ${apiUrl.protocol}`);
}
if (productionMode && ['localhost', '127.0.0.1', '::1'].includes(apiUrl.hostname)) {
  throw new Error(`生产导出拒绝使用本机 API: ${API_BASE}`);
}
const publicRoot = path.resolve(projectRoot, 'public');
const outputRoot = path.resolve(publicRoot, 'static-data');
const logoRoot = path.join(outputRoot, 'team-logos');
const entityMediaRoot = path.join(outputRoot, 'media');
const STATIC_ASSET_TOKEN = '__OWCS_STATIC_BASE__/';
const TBD_TEAM_LOGO_URL = 'https://owmini.xyz/images/tbd.png';
const CONCURRENCY = Math.max(
  1,
  Number(process.env.OWCS_EXPORT_CONCURRENCY) || (productionMode ? 4 : 6)
);
const REQUEST_ATTEMPTS = Math.max(1, Number(process.env.OWCS_EXPORT_REQUEST_ATTEMPTS) || 5);
const FORCE_LEGACY_EXPORT = process.env.OWCS_STATIC_EXPORT_LEGACY === '1';

if (!outputRoot.startsWith(`${publicRoot}${path.sep}`)) {
  throw new Error(`拒绝清理 public 目录以外的路径: ${outputRoot}`);
}

const canonicalPath = input => {
  const url = new URL(input, 'http://snapshot.local');
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
};

const asArray = value => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.list)) return value.list;
  return [];
};

const responses = {};
const warnings = [];
let completedRequests = 0;

const capture = async (requestPath, { optional = false } = {}) => {
  const key = canonicalPath(requestPath);
  if (Object.prototype.hasOwnProperty.call(responses, key)) return responses[key];

  try {
    const data = await fetchJsonWithRetry(`${API_BASE}${key}`, {
      attempts: REQUEST_ATTEMPTS,
      onRetry: ({ nextAttempt, maxAttempts, delayMs, error }) => {
        console.warn(
          `[static-export] 请求失败，${delayMs}ms 后重试 (${nextAttempt}/${maxAttempts})：GET ${key} - ${error.message}`
        );
      }
    });
    responses[key] = data;
    completedRequests += 1;
    if (completedRequests % 50 === 0) {
      console.log(`[static-export] 已获取 ${completedRequests} 个数据接口`);
    }
    return data;
  } catch (error) {
    const message = `GET ${key}: ${error.message}`;
    if (optional) {
      warnings.push(message);
      console.warn(`[static-export] 可选数据跳过：${message}`);
      return null;
    }
    throw new Error(`[static-export] 数据导出失败：${message}`, { cause: error });
  }
};

const runPool = async tasks => {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length || 1) }, async () => {
    while (cursor < tasks.length) {
      const taskIndex = cursor++;
      await tasks[taskIndex]();
    }
  });
  await Promise.all(workers);
};

const queryPath = (pathname, params = {}) => {
  const url = new URL(pathname, 'http://snapshot.local');
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return canonicalPath(`${url.pathname}${url.search}`);
};

const safeId = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '_');

const extensionFor = (url, contentType) => {
  const types = {
    'image/avif': '.avif',
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/svg+xml': '.svg',
    'image/webp': '.webp'
  };
  const normalizedType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (types[normalizedType]) return types[normalizedType];
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  } catch {
    // URL validation is handled by the caller.
  }
  return '.img';
};

const downloadEntityMedia = async ({ items, field, category, outputDir, urlPrefix }) => {
  const replacements = new Map();
  const manifest = [];

  await runPool(items.map(item => async () => {
    const sourceUrl = String(item?.[field] || '').trim();
    if (!sourceUrl) return;

    try {
      const remoteUrl = new URL(sourceUrl, apiUrl.origin);
      if (!['http:', 'https:'].includes(remoteUrl.protocol)) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let response;
      try {
        response = await fetch(remoteUrl, {
          headers: { 'User-Agent': 'OWCS-Stats-Static-Exporter/1.0' },
          redirect: 'follow',
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        throw new Error(`返回类型不是图片: ${contentType || 'unknown'}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 5 * 1024 * 1024) throw new Error('图片超过 5 MB 限制');

      const fileName = `${category}-${safeId(item.id)}${extensionFor(remoteUrl, contentType)}`;
      await writeFile(path.join(outputDir, fileName), bytes);
      const localUrl = `${STATIC_ASSET_TOKEN}${urlPrefix}/${fileName}`;
      replacements.set(sourceUrl, localUrl);
      manifest.push({ entityId: item.id, sourceUrl, localUrl, bytes: bytes.length });
    } catch (error) {
      warnings.push(`${category} ${item.id} 图片下载失败 (${sourceUrl}): ${error.message}`);
    }
  }));

  return { replacements, manifest };
};

const replaceAssetUrls = (value, replacements) => {
  if (typeof value === 'string') return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map(item => replaceAssetUrls(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceAssetUrls(item, replacements)])
    );
  }
  return value;
};

const main = async () => {
  console.log(`[static-export] 模式：${productionMode ? 'production' : 'development'}`);
  console.log(`[static-export] 数据源：${API_BASE}`);
  await rm(outputRoot, { recursive: true, force: true });
  const heroMediaRoot = path.join(entityMediaRoot, 'heroes');
  const mapMediaRoot = path.join(entityMediaRoot, 'maps');
  await Promise.all([
    mkdir(logoRoot, { recursive: true }),
    mkdir(heroMediaRoot, { recursive: true }),
    mkdir(mapMediaRoot, { recursive: true })
  ]);

  let serverSnapshot = null;
  if (!FORCE_LEGACY_EXPORT) {
    try {
      serverSnapshot = await fetchJsonWithRetry(`${API_BASE}/static-export/snapshot`, {
        attempts: 2,
        timeoutMs: 180_000,
        onRetry: ({ delayMs, error }) => {
          console.warn(`[static-export] Batch snapshot failed; retrying in ${delayMs}ms: ${error.message}`);
        }
      });
      if (serverSnapshot?.schemaVersion !== 1 || !serverSnapshot?.responses) {
        throw new Error('Unsupported batch snapshot format');
      }
      Object.assign(responses, serverSnapshot.responses);
      warnings.push(...(Array.isArray(serverSnapshot.warnings) ? serverSnapshot.warnings : []));
      completedRequests = 1;
      console.log(`[static-export] Batch snapshot loaded: ${Object.keys(responses).length} compatible responses in 1 HTTP request`);
    } catch (error) {
      serverSnapshot = null;
      console.warn(`[static-export] Batch snapshot unavailable; falling back to legacy requests: ${error.message}`);
    }
  }

  let seasonsData;
  let teamsData;
  let playersData;
  let mapsData;
  let heroesData;
  let seasonTeamsData;
  let matchesData;
  let mapGamesData;

  if (serverSnapshot) {
    seasonsData = responses['/seasons'];
    teamsData = responses['/teams'];
    playersData = responses['/players'];
    mapsData = responses['/maps'];
    heroesData = responses['/heroes'];
    seasonTeamsData = responses['/season-teams'];
    matchesData = responses[queryPath('/matches', { pageSize: 2000 })];
    mapGamesData = responses[queryPath('/map-games', { pageSize: 2000 })];
  } else {
    [seasonsData, teamsData, playersData, mapsData, heroesData, seasonTeamsData, matchesData, mapGamesData] = await Promise.all([
      capture('/seasons'),
      capture('/teams'),
      capture('/players'),
      capture('/maps'),
      capture('/heroes'),
      capture('/season-teams'),
      capture(queryPath('/matches', { pageSize: 2000 })),
      capture(queryPath('/map-games', { pageSize: 2000 }))
    ]);
  }

  await capture('/matches/upcoming', { optional: true });

  const seasons = asArray(seasonsData);
  const teams = asArray(teamsData);
  const players = asArray(playersData);
  const maps = asArray(mapsData);
  const heroes = asArray(heroesData);
  const seasonTeams = asArray(seasonTeamsData);
  const matches = asArray(matchesData);
  const mapGames = asArray(mapGamesData);

  console.log(`[static-export] 基础数据：${seasons.length} 赛季，${teams.length} 队伍，${players.length} 选手，${matches.length} 场比赛，${mapGames.length} 个地图局`);

  const configKeys = [
    'latest_match_sync_updates',
    'visualize_chart_config',
    'visualize_stage_season_order',
    ...seasons.map(season => `visualize_season_${season.id}`)
  ];
  if (!serverSnapshot) {
    await runPool(configKeys.map(key => () => capture(`/config/${encodeURIComponent(key)}`, { optional: true })));

    const seasonStageIds = new Map();
    const seasonTasks = [];
    seasons.forEach(season => {
      const seasonId = season.id;
      seasonTasks.push(
        () => capture(queryPath('/matches', { pageSize: 1000, seasonId })),
        () => capture(queryPath('/map-games', { pageSize: 1000, seasonId })),
        () => capture(queryPath('/map-games', { pageSize: 2000, seasonId })),
        () => capture(`/season-stats/${seasonId}`),
        () => capture(`/season-stats/${seasonId}/team-score`),
        () => capture(`/season-stats/${seasonId}/map-picks`),
        () => capture(`/season-stats/${seasonId}/features`),
        async () => {
          const stagesData = await capture(`/season-stats/${seasonId}/stages`);
          seasonStageIds.set(String(seasonId), asArray(stagesData).map(stage => stage.id));
        },
        () => capture(queryPath('/stats/hero/overview', { seasonId }))
      );
    });
    await runPool(seasonTasks);

    const stageTasks = [];
    seasonStageIds.forEach((stageIds, seasonId) => {
      stageIds.forEach(stageId => {
        stageTasks.push(() => capture(queryPath(`/season-stats/${seasonId}/team-score`, { stageId })));
      });
    });
    await runPool(stageTasks);

    const seasonTeamPlayers = new Map();
    await runPool(seasonTeams.map(seasonTeam => async () => {
      const relationData = await capture(`/season-teams/${seasonTeam.id}/players`);
      seasonTeamPlayers.set(String(seasonTeam.id), asArray(relationData));
    }));

    const seasonTeamsBySeason = new Map();
    seasonTeams.forEach(item => {
      const key = String(item.seasonId);
      if (!seasonTeamsBySeason.has(key)) seasonTeamsBySeason.set(key, []);
      seasonTeamsBySeason.get(key).push(item);
    });

    const teamTasks = [];
    seasons.forEach(season => {
      const seasonId = season.id;
      teamTasks.push(() => capture(`/seasons/${seasonId}/teams`));
      (seasonTeamsBySeason.get(String(seasonId)) || []).forEach(seasonTeam => {
        const teamId = seasonTeam.teamId;
        teamTasks.push(
          () => capture(queryPath('/map-games', { pageSize: 2000, seasonId, teamId })),
          () => capture(`/season-stats/${seasonId}/teams/${teamId}/compositions`),
          () => capture(`/season-stats/${seasonId}/teams/${teamId}/hero-stats`)
        );
      });
    });
    await runPool(teamTasks);

    const playerSeasonPairs = new Set();
    seasonTeams.forEach(seasonTeam => {
      (seasonTeamPlayers.get(String(seasonTeam.id)) || []).forEach(relation => {
        if (relation.playerId != null) playerSeasonPairs.add(`${relation.playerId}:${seasonTeam.seasonId}`);
      });
    });

    const playerTasks = players.map(player => () => capture(`/stats/player/${player.id}/profile`));
    playerSeasonPairs.forEach(pair => {
      const [playerId, seasonId] = pair.split(':');
      playerTasks.push(
        () => capture(queryPath(`/stats/player/${playerId}/profile`, { seasonId })),
        () => capture(queryPath('/stats/player/heroes', { playerId, seasonId }))
      );
    });
    await runPool(playerTasks);

    const heroTasks = [];
    seasons.forEach(season => {
      heroes.forEach(hero => {
        heroTasks.push(() => capture(queryPath('/stats/hero/players', { heroId: hero.id, seasonId: season.id })));
      });
    });
    await runPool(heroTasks);

    const matchTasks = [];
    matches.forEach(match => {
      matchTasks.push(
        () => capture(`/matches/${match.id}`),
        () => capture(`/matches/${match.id}/map-games`)
      );
    });
    mapGames.forEach(mapGame => {
      matchTasks.push(() => capture(`/map-games/${mapGame.id}/player-stats`));
    });
    await runPool(matchTasks);
  }

  const [teamMedia, heroMedia, mapMedia] = await Promise.all([
    downloadEntityMedia({
      items: [...teams, { id: 'tbd', logo: TBD_TEAM_LOGO_URL }],
      field: 'logo',
      category: 'team',
      outputDir: logoRoot,
      urlPrefix: 'static-data/team-logos'
    }),
    downloadEntityMedia({
      items: heroes,
      field: 'image',
      category: 'hero',
      outputDir: heroMediaRoot,
      urlPrefix: 'static-data/media/heroes'
    }),
    downloadEntityMedia({
      items: maps,
      field: 'image',
      category: 'map',
      outputDir: mapMediaRoot,
      urlPrefix: 'static-data/media/maps'
    })
  ]);
  const replacements = new Map([
    ...teamMedia.replacements,
    ...heroMedia.replacements,
    ...mapMedia.replacements
  ]);
  const logoManifest = teamMedia.manifest;
  const localizedResponses = replaceAssetUrls(responses, replacements);
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'OWCS Stats read-only static snapshot',
    exportMode: productionMode ? 'production' : 'development',
    sourceApi: API_BASE,
    counts: {
      seasons: seasons.length,
      teams: teams.length,
      players: players.length,
      maps: maps.length,
      heroes: heroes.length,
      matches: matches.length,
      mapGames: mapGames.length,
      responses: Object.keys(localizedResponses).length,
      localizedTeamLogos: logoManifest.filter(item => item.entityId !== 'tbd').length,
      localizedHeroImages: heroMedia.manifest.length,
      localizedMapImages: mapMedia.manifest.length
    },
    responses: localizedResponses
  };

  await writeFile(path.join(outputRoot, 'api-cache.json'), JSON.stringify(snapshot));
  await writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify({
    ...snapshot.counts,
    generatedAt: snapshot.generatedAt,
    exportMode: snapshot.exportMode,
    sourceApi: snapshot.sourceApi,
    warnings,
    teamLogos: logoManifest,
    heroImages: heroMedia.manifest,
    mapImages: mapMedia.manifest
  }, null, 2));

  console.log(`[static-export] 完成：${snapshot.counts.responses} 个接口快照，队伍 ${snapshot.counts.localizedTeamLogos}/${teams.filter(team => team.logo).length}，英雄 ${snapshot.counts.localizedHeroImages}/${heroes.filter(hero => hero.image).length}，地图 ${snapshot.counts.localizedMapImages}/${maps.filter(map => map.image).length} 张图片已本地化`);
  if (warnings.length) console.warn(`[static-export] ${warnings.length} 条警告，详见 public/static-data/manifest.json`);
};

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
