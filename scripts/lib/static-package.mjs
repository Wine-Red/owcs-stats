import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mediaKey = /^(?:logo|image|icon|avatar|banner|backgroundImage|cover)(?:Url)?$/i;
export const mediaSources = value => {
  const result = new Set();
  const visit = (item, key = '') => {
    if (typeof item === 'string' && item && mediaKey.test(key) && !/^(?:data:|blob:|__OWCS_STATIC_BASE__)/.test(item)) result.add(item);
    else if (Array.isArray(item)) item.forEach(child => visit(child));
    else if (item && typeof item === 'object') Object.entries(item).forEach(([name, child]) => visit(child, name));
  };
  visit(value);
  return [...result];
};
export const replaceMedia = (value, replacements) => {
  if (typeof value === 'string') return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map(item => replaceMedia(item, replacements));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceMedia(item, replacements)]));
  return value;
};
export const validateSnapshot = snapshot => {
  if (snapshot?.schemaVersion !== 2 || !snapshot.collections || !snapshot.views || !snapshot.timelines) throw new Error('需要 v2 完整快照；请先升级后端，不回退到旧请求缓存');
  for (const name of ['seasons', 'teams', 'players', 'maps', 'heroes', 'seasonTeams', 'seasonTeamPlayers', 'matches', 'mapGames', 'playerStats']) {
    const rows = snapshot.collections[name];
    if (!Array.isArray(rows)) throw new Error(`缺少集合 ${name}`);
    const ids = new Set(rows.map(row => row.id));
    if (ids.size !== rows.length) throw new Error(`集合 ${name} 存在重复 ID`);
    if (snapshot.counts[name] !== undefined && snapshot.counts[name] !== rows.length) throw new Error(`集合 ${name} 被截断或计数不符`);
  }
  if (!snapshot.collections.seasons.length || !snapshot.collections.teams.length) throw new Error('快照缺少赛事或队伍');
  if (!Array.isArray(snapshot.schedule?.data) || !Number.isFinite(snapshot.schedule?.observedAt)) throw new Error('快照缺少赛程或来源读取时间');
  if (snapshot.schedule.stale) throw new Error('赛程来源已过期，保留上一份发布包');
  for (const game of snapshot.collections.mapGames) {
    if (game.timeline && !snapshot.timelines[game.id]?.payload) throw new Error(`地图局 ${game.id} 缺少时间线正文`);
  }
  return snapshot;
};
export const writeResources = async (directory, snapshot) => {
  const files = {};
  const write = async (name, value) => {
    const bytes = Buffer.from(JSON.stringify(value)), sha256 = hash(bytes);
    const relative = `data/${name.replace(/:/g, '_')}-${sha256.slice(0, 16)}.json`;
    await writeFile(path.join(directory, relative), bytes);
    files[name] = { path: relative, sha256, bytes: bytes.length };
  };
  await mkdir(path.join(directory, 'data'), { recursive: true });
  for (const group of ['collections', 'views', 'timelines']) {
    for (const [key, value] of Object.entries(snapshot[group])) {
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error(`非法资源名: ${key}`);
      if (group === 'views' && key !== 'config') {
        for (const [id, record] of Object.entries(value)) {
          if (!/^\d+(?::\d+)?$/.test(id)) throw new Error(`非法视图标识: ${id}`);
          await write(`${group}.${key}.${id}`, record);
        }
      } else await write(`${group}.${key}`, value);
    }
  }
  await write('schedule', snapshot.schedule);
  return files;
};
export const verifyResources = async (directory, manifest) => {
  if (manifest.schemaVersion !== 2 || !manifest.files) throw new Error('Invalid static manifest');
  for (const item of [...Object.values(manifest.files), ...(manifest.assets || [])]) {
    const resolved = path.resolve(directory, item.path);
    if (!resolved.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('资源路径越界');
    const bytes = await readFile(resolved);
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) throw new Error(`文件校验失败: ${item.path}`);
  }
};
