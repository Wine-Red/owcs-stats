const { createHash } = require('node:crypto');
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const Team = require('../models/Team');
const Player = require('../models/Player');
const TeamAlias = require('../models/TeamAlias');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeamSource = require('../models/SeasonTeamSource');
const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource');
const MatchPoll = require('../models/MatchPoll');
const { MatchVote } = require('../models/MatchVote');
const { PlayerAlias, PlayerExternalIdentity, EntityRedirect, EntityMergeAudit } = require('../models/EntityIdentity');
const { identityTransaction } = require('./IdentityWriteService');
const { cleanAliasList, normalizeTeamIdentity: nameKey } = require('./TeamAliasService');
const { externalKey } = require('./PlayerIdentityService');
const { getTeamLiquipediaUrls, normalizeTeamLiquipediaUrls } = require('./TeamLiquipediaLink');

const MODELS = { teams: Team, players: Player, team_aliases: TeamAlias, player_aliases: PlayerAlias,
  player_external_identities: PlayerExternalIdentity, matches: Match, map_games: MapGame, player_stats: PlayerStat,
  season_teams: SeasonTeam, season_team_players: SeasonTeamPlayer, season_team_sources: SeasonTeamSource,
  season_team_player_sources: SeasonTeamPlayerSource, match_polls: MatchPoll, match_votes: MatchVote,
  entity_redirects: EntityRedirect };
const fail = (message, statusCode = 409, details = {}) => Object.assign(new Error(message), { statusCode, ...details });
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pairKey = (a, b) => [Number(a), Number(b)].sort((x, y) => x - y).join(':');
const validateRequest = (kind, sourceId, targetId) => {
  if (!['team', 'player'].includes(kind) || ![sourceId, targetId].every(id => Number.isSafeInteger(id) && id > 0) || sourceId === targetId) {
    throw fail('请选择两个不同且有效的身份', 400);
  }
};

// Includes the non-FK voting references. New FK tables must be consciously
// added here instead of letting a future cascade silently delete data.
const KNOWN_REFS = new Set([
  'matches.team1Id', 'matches.team2Id', 'matches.winnerId',
  'map_games.team1Id', 'map_games.team2Id', 'map_games.winnerId',
  'player_stats.teamId', 'player_stats.playerId', 'season_teams.teamId',
  'season_team_players.playerId', 'season_team_players.seasonTeamId',
  'season_team_sources.seasonTeamId', 'season_team_player_sources.seasonTeamPlayerId',
  'team_aliases.teamId', 'player_aliases.playerId', 'player_external_identities.playerId'
]);
const loadSnapshot = async (kind, sourceId, targetId, transaction) => {
  const ids = [sourceId, targetId];
  const rows = {};
  const read = async (table, where) => {
    rows[table] = await MODELS[table].findAll({ transaction, raw: true, order: [['id', 'ASC']], ...(where ? { where } : {}) });
  };
  await read(kind === 'team' ? 'teams' : 'players');
  await read(kind === 'team' ? 'team_aliases' : 'player_aliases');
  await read('entity_redirects', { kind });
  if (kind === 'team') {
    const teamWhere = { [Op.or]: ['team1Id', 'team2Id', 'winnerId'].map(field => ({ [field]: ids })) };
    await read('matches', teamWhere);
    await read('map_games', teamWhere);
    await read('player_stats', { teamId: ids });
    await read('season_teams', { teamId: ids });
    await read('season_team_players', { seasonTeamId: rows.season_teams.map(row => row.id) });
    await read('season_team_sources', { seasonTeamId: rows.season_teams.map(row => row.id) });
    await read('match_polls', { [Op.or]: [{ team1Id: ids }, { team2Id: ids }] });
    await read('match_votes', { [Op.or]: [{ teamId: ids }, { pollId: rows.match_polls.filter(p => ids.includes(p.team1Id) || ids.includes(p.team2Id)).map(p => p.id) }] });
  } else {
    await read('player_external_identities');
    await read('player_stats', { playerId: ids });
    await read('season_team_players', { playerId: ids });
    await read('season_teams', { id: [...new Set(rows.season_team_players.map(row => row.seasonTeamId))] });
  }
  await read('season_team_player_sources', { seasonTeamPlayerId: rows.season_team_players.map(row => row.id) });
  const foreignKeys = await sequelize.query(`SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
    FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE()
    AND REFERENCED_TABLE_NAME IN (:parents)
    ORDER BY TABLE_NAME, COLUMN_NAME`, { transaction, type: QueryTypes.SELECT,
    replacements: { parents: [Team, Player, SeasonTeam, SeasonTeamPlayer].map(model => model.getTableName()) } });
  const names = new Map(Object.entries(MODELS).map(([name, model]) => [model.getTableName(), name]));
  const timelinePlayers = kind === 'player' ? (await require('../models/MapGameTimeline').findAll({
    where: { mapGameId: [...new Set(rows.player_stats.map(row => row.mapGameId))] },
    attributes: ['mapGameId', 'payload', 'digest', 'revision'], transaction, raw: true, order: [['mapGameId', 'ASC']]
  })).map(row => ({ mapGameId: row.mapGameId, digest: row.digest, revision: row.revision,
    playerIds: (row.payload?.players || []).map(player => externalKey(player.playerId)) })) : [];
  return { rows, timelinePlayers, unknownReferences: foreignKeys.map(r => `${names.get(r.tableName) || r.tableName}.${r.columnName}`).filter(ref => !KNOWN_REFS.has(ref)) };
};

// Pure operation planning lets preview, execution and regression tests share the
// same conflict rules. The audit stores the exact before-images of mutations.
const planMerge = (kind, sourceId, targetId, snapshot) => {
  validateRequest(kind, sourceId, targetId);
  const data = clone(snapshot.rows), operations = [], conflicts = [], warnings = [];
  const table = kind === 'team' ? 'teams' : 'players';
  const aliasTable = kind === 'team' ? 'team_aliases' : 'player_aliases';
  const ownerField = kind === 'team' ? 'teamId' : 'playerId';
  const source = data[table].find(row => row.id === sourceId), target = data[table].find(row => row.id === targetId);
  if (!source || !target) throw fail('身份已不存在或已经合并，请刷新列表', 404);
  const beforeSource = clone(source), beforeTarget = clone(target);
  const aliases = cleanAliasList([...(data[aliasTable] || []).filter(a => [sourceId, targetId].includes(a[ownerField])).map(a => a.alias), source.name], target.name);
  const registerConflict = (code, message, ids = []) => conflicts.push({ code, message, ids });
  if (snapshot.unknownReferences?.length) registerConflict('UNKNOWN_REFERENCE', `发现未支持的引用：${snapshot.unknownReferences.join('、')}`);
  for (const alias of aliases) {
    const key = nameKey(alias);
    if (data[table].some(row => ![sourceId, targetId].includes(row.id) && nameKey(row.name) === key)
      || data[aliasTable].some(row => ![sourceId, targetId].includes(row[ownerField]) && row.normalizedAlias === key)) {
      registerConflict('ALIAS_CONFLICT', `别名“${alias}”已属于第三个身份`);
    }
  }
  const differences = (kind === 'team' ? ['region', 'logo'] : ['role']).filter(key => source[key] !== target[key]);
  if (differences.length) warnings.push(`资料存在差异（${differences.map(key => ({ region: '地区', logo: '队标', role: '位置' }[key])).join('、')}），保留目标资料`);
  const update = (tableName, row, values) => {
    if (Object.entries(values).every(([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value))) return;
    operations.push({ table: tableName, type: 'update', id: row.id, before: clone(row), values: clone(values) });
    Object.assign(row, values);
  };
  const remove = (tableName, row) => {
    operations.push({ table: tableName, type: 'delete', id: row.id, before: clone(row) });
    data[tableName] = data[tableName].filter(item => item.id !== row.id);
  };
  const insert = (tableName, values) => operations.push({ table: tableName, type: 'insert', values: clone(values) });
  const earlier = (a, b) => !a ? b : !b ? a : new Date(a) <= new Date(b) ? a : b;
  const later = (a, b) => !a ? b : !b ? a : new Date(a) >= new Date(b) ? a : b;
  const moveEvidence = (tableName, field, fromId, toId) => {
    for (const row of [...(data[tableName] || [])].filter(r => r[field] === fromId)) {
      const other = data[tableName].find(r => r[field] === toId && r.sourceType === row.sourceType && r.sourceKey === row.sourceKey);
      if (other) {
        update(tableName, other, { active: !!(other.active || row.active), firstSeenAt: earlier(other.firstSeenAt, row.firstSeenAt), lastSeenAt: later(other.lastSeenAt, row.lastSeenAt) });
        remove(tableName, row);
      } else update(tableName, row, { [field]: toId });
    }
  };
  let coalescedMemberships = 0;
  const moveMembership = (row, values) => {
    const destination = { ...row, ...values };
    const other = data.season_team_players.find(r => r.id !== row.id && r.playerId === destination.playerId && r.seasonTeamId === destination.seasonTeamId);
    if (other) {
      moveEvidence('season_team_player_sources', 'seasonTeamPlayerId', row.id, other.id);
      update('season_team_players', other, { joinDate: earlier(other.joinDate, row.joinDate), leaveDate: !other.leaveDate || !row.leaveDate ? null : later(other.leaveDate, row.leaveDate) });
      remove('season_team_players', row);
      coalescedMemberships++;
    } else update('season_team_players', row, values);
  };
  if (kind === 'team') {
    for (const tableName of ['matches', 'map_games', 'match_polls']) {
      const selfMatches = data[tableName].filter(row => [sourceId, targetId].includes(row.team1Id) && [sourceId, targetId].includes(row.team2Id));
      if (selfMatches.length) registerConflict('SELF_OPPONENT', `${{ matches: '比赛', map_games: '地图局', match_polls: '投票' }[tableName]}中存在双方待合并身份，不能合为同队`, selfMatches.map(r => r.id));
    }
    const projectedPolls = data.match_polls.map(p => ({ ...p, pairKey: pairKey(p.team1Id === sourceId ? targetId : p.team1Id, p.team2Id === sourceId ? targetId : p.team2Id) }));
    const pollKeys = new Map();
    for (const poll of projectedPolls) {
      const key = `${poll.sourceId}\0${poll.pairKey}`;
      if (pollKeys.has(key)) registerConflict('POLL_COLLISION', '合并后两份投票会指向同一对阵，需要先人工核对投票', [pollKeys.get(key), poll.id]);
      pollKeys.set(key, poll.id);
    }
    const links = normalizeTeamLiquipediaUrls([...getTeamLiquipediaUrls(target), ...getTeamLiquipediaUrls(source)]);
    const linkKeys = new Set(links.map(nameKey));
    if (data.teams.some(row => ![sourceId, targetId].includes(row.id) && getTeamLiquipediaUrls(row).some(url => linkKeys.has(nameKey(url))))) registerConflict('PAGE_CONFLICT', 'Liquipedia 页面还绑定了第三支队伍');
    update('teams', target, { liquipediaUrl: links[0] || null, liquipediaUrls: links });
    for (const tableName of ['matches', 'map_games', 'match_polls']) for (const row of data[tableName]) {
      const values = Object.fromEntries(['team1Id', 'team2Id', 'winnerId'].filter(key => row[key] === sourceId).map(key => [key, targetId]));
      if (!Object.keys(values).length) continue;
      if (tableName === 'match_polls') values.pairKey = pairKey(values.team1Id || row.team1Id, values.team2Id || row.team2Id);
      update(tableName, row, values);
    }
    for (const row of data.match_votes.filter(row => row.teamId === sourceId)) update('match_votes', row, { teamId: targetId });
    for (const relation of [...data.season_teams].filter(row => row.teamId === sourceId)) {
      const other = data.season_teams.find(row => row.teamId === targetId && row.seasonId === relation.seasonId);
      if (other) {
        for (const member of [...data.season_team_players].filter(row => row.seasonTeamId === relation.id)) moveMembership(member, { seasonTeamId: other.id });
        moveEvidence('season_team_sources', 'seasonTeamId', relation.id, other.id);
        remove('season_teams', relation);
      } else update('season_teams', relation, { teamId: targetId });
    }
  } else {
    const targetMaps = new Set(data.player_stats.filter(row => row.playerId === targetId).map(row => row.mapGameId));
    const overlap = [...new Set(data.player_stats.filter(row => row.playerId === sourceId && targetMaps.has(row.mapGameId)).map(row => row.mapGameId))];
    if (overlap.length) registerConflict('PLAYER_MAP_OVERLAP', '同一地图局同时记录了两个选手身份，不能相加或丢弃其中一份', overlap);
    const externalIdsFor = player => new Set([player.externalId, ...data.player_external_identities.filter(row => row.playerId === player.id && row.source === 'matchweb').map(row => row.externalId)].filter(Boolean).map(externalKey));
    const sourceIds = externalIdsFor(source), targetIds = externalIdsFor(target);
    const timelineOverlap = (snapshot.timelinePlayers || []).filter(row => row.playerIds.some(id => sourceIds.has(id)) && row.playerIds.some(id => targetIds.has(id)));
    if (timelineOverlap.length) registerConflict('PLAYER_TIMELINE_OVERLAP', '原始时间线中两个选手身份同时出现，需要先核对来源', timelineOverlap.map(row => row.mapGameId));
    for (const relation of [...data.season_team_players].filter(row => row.playerId === sourceId)) moveMembership(relation, { playerId: targetId });
    for (const row of data.player_external_identities.filter(row => row.playerId === sourceId)) update('player_external_identities', row, { playerId: targetId });
    for (const player of [source, target]) if (player.externalId) {
      const normalizedExternalId = externalKey(player.externalId);
      const existing = data.player_external_identities.find(row => row.source === 'matchweb' && row.normalizedExternalId === normalizedExternalId);
      if (existing && existing.playerId !== targetId) registerConflict('EXTERNAL_ID_CONFLICT', `外部 ID ${player.externalId} 已绑定第三个选手`);
      if (!existing) insert('player_external_identities', { playerId: targetId, source: 'matchweb', externalId: player.externalId, normalizedExternalId });
    }
    // Free the legacy unique slot before assigning it to the canonical player.
    const primary = target.externalId || source.externalId || null;
    if (source.externalId) update('players', source, { externalId: null });
    update('players', target, { externalId: primary, identityOrigin: 'manual', orphanedAt: null });
  }
  for (const stat of data.player_stats.filter(row => row[ownerField] === sourceId)) update('player_stats', stat, { [ownerField]: targetId });
  for (const row of [...data[aliasTable]].filter(row => [sourceId, targetId].includes(row[ownerField]))) remove(aliasTable, row);
  for (const alias of aliases) insert(aliasTable, { [ownerField]: targetId, alias, normalizedAlias: nameKey(alias) });
  for (const redirect of data.entity_redirects.filter(row => row.targetId === sourceId)) update('entity_redirects', redirect, { targetId });
  insert('entity_redirects', { kind, sourceId, targetId, sourceName: beforeSource.name,
    protectedAliases: cleanAliasList([beforeSource.name, beforeTarget.name, ...aliases]) });
  remove(table, source);
  const counts = {};
  for (const operation of operations) {
    counts[operation.table] ||= { update: 0, delete: 0, insert: 0 };
    counts[operation.table][operation.type]++;
  }
  const preview = { kind, source: beforeSource, target: beforeTarget, aliases,
    externalIds: kind === 'player' ? [...new Set([beforeSource.externalId, beforeTarget.externalId,
      ...data.player_external_identities.filter(row => row.playerId === targetId).map(row => row.externalId)].filter(Boolean))] : [],
    liquipediaUrls: kind === 'team' ? target.liquipediaUrls : [],
    counts, coalescedMemberships, conflicts, warnings, canMerge: !conflicts.length,
    fingerprint: hash({ kind, sourceId, targetId, snapshot }) };
  return { preview, operations };
};

const previewMerge = (kind, sourceId, targetId) => {
  validateRequest(kind, sourceId, targetId);
  return sequelize.transaction(async transaction => planMerge(kind, sourceId, targetId, await loadSnapshot(kind, sourceId, targetId, transaction)).preview);
};

const applyMerge = async (kind, sourceId, targetId, fingerprint) => {
  validateRequest(kind, sourceId, targetId);
  if (!/^[a-f0-9]{64}$/.test(String(fingerprint || ''))) throw fail('请先预览合并影响', 400);
  return identityTransaction(async transaction => {
    const previous = await EntityMergeAudit.findOne({ where: { kind, sourceId, targetId, fingerprint }, transaction });
    if (previous) return { ...previous.summary, auditId: previous.id, alreadyApplied: true };
    const snapshot = await loadSnapshot(kind, sourceId, targetId, transaction);
    const { preview, operations } = planMerge(kind, sourceId, targetId, snapshot);
    if (preview.fingerprint !== fingerprint) throw fail('数据已变化，请重新预览后再合并', 409, { code: 'MERGE_PREVIEW_STALE' });
    if (!preview.canMerge) throw fail('存在合并冲突，请先处理', 409, { code: 'MERGE_CONFLICT', conflicts: preview.conflicts });
    const audit = await EntityMergeAudit.create({ kind, sourceId, targetId, fingerprint, before: operations,
      summary: preview }, { transaction });
    for (const operation of operations) {
      const model = MODELS[operation.table];
      if (operation.type === 'insert') await model.create(operation.values, { transaction });
      else if (operation.type === 'delete') await model.destroy({ where: { id: operation.id }, transaction });
      else await model.update(operation.values, { where: { id: operation.id }, transaction });
    }
    return { ...preview, auditId: audit.id, alreadyApplied: false };
  });
};

module.exports = { planMerge, previewMerge, applyMerge, loadSnapshot, MODELS };
