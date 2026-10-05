const Player = require('../models/Player');
const { PlayerAlias, PlayerExternalIdentity, EntityRedirect } = require('../models/EntityIdentity');
const { normalizeTeamIdentity: nameKey, cleanAliasList } = require('./TeamAliasService');

// Matchweb IDs historically compared case-insensitively. Do not normalize
// punctuation, Unicode compatibility characters or interior whitespace in IDs.
const externalKey = value => String(value || '').trim().toLowerCase();
const fail = message => Object.assign(new Error(message), { statusCode: 409 });
const plain = row => row?.toJSON ? row.toJSON() : row;

const protectedAliases = async (kind, targetId, transaction) => {
  const redirects = await EntityRedirect.findAll({ where: { kind, targetId }, transaction });
  return redirects.flatMap(row => row.protectedAliases || [row.sourceName]);
};

const resolveCanonicalId = async (kind, id, transaction) => {
  const redirect = await EntityRedirect.findOne({ where: { kind, sourceId: Number(id) }, transaction });
  return redirect ? Number(redirect.targetId) : Number(id);
};

const getIdentityMaintenance = async (kind, id) => {
  const { Op } = require('sequelize');
  const { EntityMergeAudit } = require('../models/EntityIdentity');
  const redirects = await EntityRedirect.findAll({ where: { kind, targetId: id } });
  const ids = [Number(id), ...redirects.map(row => Number(row.sourceId))];
  const merges = await EntityMergeAudit.findAll({ where: { kind, [Op.or]: [{ sourceId: ids }, { targetId: ids }] },
    attributes: ['id', 'sourceId', 'targetId', 'createdAt', 'summary'], order: [['id', 'DESC']], limit: 50, raw: true });
  const externalIds = kind === 'player' ? await PlayerExternalIdentity.findAll({ where: { playerId: id },
    attributes: ['source', 'externalId'], order: [['id', 'ASC']], raw: true }) : [];
  return { externalIds, merges: merges.map(row => ({ id: row.id, sourceId: row.sourceId, targetId: row.targetId,
    sourceName: row.summary.source.name, targetName: row.summary.target.name, createdAt: row.createdAt })) };
};

const serializePlayersWithAliases = async (input, transaction) => {
  const rows = Array.isArray(input) ? input : [input];
  if (!rows.length) return [];
  const aliases = await PlayerAlias.findAll({ where: { playerId: rows.map(row => row.id) }, transaction, order: [['alias', 'ASC']] });
  const redirects = await EntityRedirect.findAll({ where: { kind: 'player', targetId: rows.map(row => row.id) }, transaction });
  const result = rows.map(row => ({ ...plain(row), aliases: aliases.filter(a => Number(a.playerId) === Number(row.id)).map(a => a.alias),
    mergedIds: redirects.filter(r => Number(r.targetId) === Number(row.id)).map(r => Number(r.sourceId)) }));
  return Array.isArray(input) ? result : result[0];
};

const validatePlayerIdentity = async ({ playerId = null, name, role, aliases = [], transaction }) => {
  const cleanName = String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!cleanName || cleanName.length > 191) throw new Error('选手名称不能为空且不能超过 191 个字符');
  const cleaned = cleanAliasList(aliases, cleanName);
  const [players, stored] = await Promise.all([Player.findAll({ transaction }), PlayerAlias.findAll({ transaction })]);
  const current = players.find(p => Number(p.id) === Number(playerId));
  if (current && role && current.role !== role) throw fail('选手换位置请新建同名选手，不能修改原记录的位置');
  const effectiveRole = role || current?.role;
  const sameRole = id => !effectiveRole || players.find(p => Number(p.id) === Number(id))?.role === effectiveRole;
  for (const value of [cleanName, ...cleaned]) {
    const key = nameKey(value);
    if (value === cleanName && current && nameKey(current.name) === key && current.role === effectiveRole) continue;
    const collision = players.find(p => Number(p.id) !== Number(playerId) && sameRole(p.id) && nameKey(p.name) === key)
      || stored.find(a => Number(a.playerId) !== Number(playerId) && sameRole(a.playerId) && a.normalizedAlias === key);
    if (collision) throw fail(`名称或别名“${value}”已属于其他选手，请核对身份或使用合并`);
  }
  return { name: cleanName, aliases: cleaned };
};

const replacePlayerAliases = async (playerId, aliases, transaction) => {
  await PlayerAlias.destroy({ where: { playerId }, transaction });
  if (aliases.length) await PlayerAlias.bulkCreate(aliases.map(alias => ({ playerId, alias, normalizedAlias: nameKey(alias) })), { transaction });
};

const bindExternalIdentity = async (player, externalId, transaction) => {
  if (!externalId) return null;
  if (externalId.length > 160) throw new Error('Matchweb 选手 ID 超过 160 个字符');
  const where = { source: 'matchweb', normalizedExternalId: externalKey(externalId), role: player.role };
  const [identity] = await PlayerExternalIdentity.findOrCreate({ where, defaults: { ...where, playerId: player.id, externalId }, transaction });
  if (Number(identity.playerId) !== Number(player.id)) throw fail(`外部选手 ID ${externalId} 已绑定其他身份`);
  return identity;
};

const resolveSourcePlayer = (source, role, caches) => {
  const externalId = String(source.playerId || '').trim();
  if (externalId) {
    const identity = (caches.playerExternalIdentities || []).find(row => row.source === 'matchweb' && row.normalizedExternalId === externalKey(externalId)
      && (row.role || caches.players.find(p => Number(p.id) === Number(row.playerId))?.role) === role);
    const mapped = identity && caches.players.find(player => Number(player.id) === Number(identity.playerId));
    if (identity && !mapped) throw new Error('外部选手身份映射已损坏');
    const legacy = caches.players.filter(p => externalKey(p.externalId) === externalKey(externalId) && p.role === role);
    if (mapped && mapped.role !== role) throw fail('外部选手身份映射位置不一致');
    if (mapped) return mapped;
    if (legacy.length > 1) throw fail(`外部选手 ID ${externalId} 对应多个本地身份`);
    if (legacy.length === 1) return legacy[0];
  }
  const aliasIds = new Set((caches.playerAliases || []).filter(a => a.normalizedAlias === nameKey(source.name)).map(a => Number(a.playerId)));
  const named = caches.players.filter(p => nameKey(p.name) === nameKey(source.name) || aliasIds.has(Number(p.id)));
  // Legacy records can share a name across roles. Narrow that fallback before
  // deciding it is ambiguous; external IDs are also scoped to the source role.
  const matches = named.filter(p => p.role === role);
  if (matches.length > 1) throw fail(`选手“${source.name}”存在多个候选身份，需人工核对`);
  if (!externalId || !matches.length) return matches[0] || null;
  const candidate = matches[0];
  // A confirmed alias may safely attach a newly observed source ID. A plain
  // same-name match is still insufficient to claim an already bound identity.
  if (aliasIds.has(Number(candidate.id))) {
    return candidate;
  }
  return !candidate.externalId ? candidate : null;
};

module.exports = { nameKey, externalKey, protectedAliases, resolveCanonicalId, getIdentityMaintenance, serializePlayersWithAliases,
  validatePlayerIdentity, replacePlayerAliases, bindExternalIdentity, resolveSourcePlayer };
