const { Op } = require('sequelize');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeamSource = require('../models/SeasonTeamSource');
const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource');
const Player = require('../models/Player');
const PlayerStat = require('../models/PlayerStat');

const SOURCE_TYPES = Object.freeze({
  MANUAL: 'manual',
  MATCH: 'match',
  OWTV: 'owtv',
  LIQUIPEDIA: 'liquipedia',
  LEGACY: 'legacy'
});
const MANUAL_SOURCE_KEY = 'admin';
const LEGACY_SOURCE_KEY = 'migration-v1';
const DEFAULT_ORPHAN_GRACE_DAYS = 7;

const normalizeSourceKey = value => String(value || '').trim();

const activateSource = async (Model, relationField, relationId, sourceType, sourceKey, transaction) => {
  const key = normalizeSourceKey(sourceKey);
  if (!key) throw new Error('Membership source key is required');
  const now = new Date();
  const where = { [relationField]: relationId, sourceType, sourceKey: key };
  const existing = await Model.findOne({ where, transaction });
  if (existing) {
    await existing.update({ active: true, lastSeenAt: now }, { transaction });
    return { source: existing, created: false };
  }
  const source = await Model.create({
    ...where,
    active: true,
    firstSeenAt: now,
    lastSeenAt: now
  }, { transaction });
  return { source, created: true };
};

const activateSeasonTeamSource = (seasonTeamId, sourceType, sourceKey, transaction) => (
  activateSource(SeasonTeamSource, 'seasonTeamId', seasonTeamId, sourceType, sourceKey, transaction)
);

const activateSeasonTeamPlayerSource = (seasonTeamPlayerId, sourceType, sourceKey, transaction) => (
  activateSource(SeasonTeamPlayerSource, 'seasonTeamPlayerId', seasonTeamPlayerId, sourceType, sourceKey, transaction)
);

const ensureSeasonTeam = async ({ seasonId, teamId, sourceType, sourceKey, transaction }) => {
  const [seasonTeam, relationCreated] = await SeasonTeam.findOrCreate({
    where: { seasonId, teamId },
    defaults: { seasonId, teamId },
    transaction
  });
  const { created: sourceCreated } = await activateSeasonTeamSource(
    seasonTeam.id,
    sourceType,
    sourceKey,
    transaction
  );
  return { seasonTeam, relationCreated, sourceCreated };
};

const ensureSeasonTeamPlayer = async ({ seasonTeam, playerId, sourceType, sourceKey, transaction }) => {
  const [seasonTeamPlayer, relationCreated] = await SeasonTeamPlayer.findOrCreate({
    where: { seasonTeamId: seasonTeam.id, playerId },
    defaults: { seasonTeamId: seasonTeam.id, playerId },
    transaction
  });
  const { created: sourceCreated } = await activateSeasonTeamPlayerSource(
    seasonTeamPlayer.id,
    sourceType,
    sourceKey,
    transaction
  );
  return { seasonTeamPlayer, relationCreated, sourceCreated };
};

const deactivateMatchSources = async (sourceKey, transaction) => {
  const key = normalizeSourceKey(sourceKey);
  const playerSources = await SeasonTeamPlayerSource.findAll({
    where: { sourceType: SOURCE_TYPES.MATCH, sourceKey: key, active: true },
    attributes: ['seasonTeamPlayerId'],
    transaction,
    raw: true
  });
  const teamSources = await SeasonTeamSource.findAll({
    where: { sourceType: SOURCE_TYPES.MATCH, sourceKey: key, active: true },
    attributes: ['seasonTeamId'],
    transaction,
    raw: true
  });
  await SeasonTeamPlayerSource.update(
    { active: false, lastSeenAt: new Date() },
    { where: { sourceType: SOURCE_TYPES.MATCH, sourceKey: key, active: true }, transaction }
  );
  await SeasonTeamSource.update(
    { active: false, lastSeenAt: new Date() },
    { where: { sourceType: SOURCE_TYPES.MATCH, sourceKey: key, active: true }, transaction }
  );
  return {
    seasonTeamIds: new Set(teamSources.map(row => Number(row.seasonTeamId))),
    seasonTeamPlayerIds: new Set(playerSources.map(row => Number(row.seasonTeamPlayerId)))
  };
};

const mergeTouchedMemberships = (target, source) => {
  source?.seasonTeamIds?.forEach(id => target.seasonTeamIds.add(Number(id)));
  source?.seasonTeamPlayerIds?.forEach(id => target.seasonTeamPlayerIds.add(Number(id)));
  return target;
};

const createTouchedMemberships = () => ({
  seasonTeamIds: new Set(),
  seasonTeamPlayerIds: new Set()
});

const activeSourceTypes = async (Model, relationField, relationId, transaction) => {
  const rows = await Model.findAll({
    where: { [relationField]: relationId, active: true },
    attributes: ['sourceType'],
    transaction,
    raw: true
  });
  return [...new Set(rows.map(row => row.sourceType))].sort();
};

const reconcileMemberships = async (touched, transaction) => {
  const removedSeasonTeamPlayerIds = [];
  const retainedSeasonTeamPlayerIds = [];
  for (const id of touched.seasonTeamPlayerIds || []) {
    const relation = await SeasonTeamPlayer.findByPk(id, { transaction });
    if (!relation) continue;
    const sourceCount = await SeasonTeamPlayerSource.count({
      where: { seasonTeamPlayerId: id, active: true },
      transaction
    });
    if (sourceCount === 0) {
      touched.seasonTeamIds.add(Number(relation.seasonTeamId));
      await relation.destroy({ transaction });
      removedSeasonTeamPlayerIds.push(Number(id));
    } else {
      retainedSeasonTeamPlayerIds.push(Number(id));
    }
  }

  const removedSeasonTeamIds = [];
  const retainedSeasonTeamIds = [];
  for (const id of touched.seasonTeamIds || []) {
    const relation = await SeasonTeam.findByPk(id, { transaction });
    if (!relation) continue;
    const [sourceCount, playerCount] = await Promise.all([
      SeasonTeamSource.count({ where: { seasonTeamId: id, active: true }, transaction }),
      SeasonTeamPlayer.count({ where: { seasonTeamId: id }, transaction })
    ]);
    if (sourceCount === 0 && playerCount === 0) {
      await relation.destroy({ transaction });
      removedSeasonTeamIds.push(Number(id));
    } else {
      retainedSeasonTeamIds.push(Number(id));
    }
  }

  return {
    removedSeasonTeamIds,
    removedSeasonTeamPlayerIds,
    retainedSeasonTeamIds,
    retainedSeasonTeamPlayerIds
  };
};

const addManualSeasonTeam = ({ seasonId, teamId, transaction }) => ensureSeasonTeam({
  seasonId,
  teamId,
  sourceType: SOURCE_TYPES.MANUAL,
  sourceKey: MANUAL_SOURCE_KEY,
  transaction
});

const addManualSeasonTeamPlayer = async ({ seasonTeam, playerId, transaction }) => {
  await activateSeasonTeamSource(seasonTeam.id, SOURCE_TYPES.MANUAL, MANUAL_SOURCE_KEY, transaction);
  return ensureSeasonTeamPlayer({
    seasonTeam,
    playerId,
    sourceType: SOURCE_TYPES.MANUAL,
    sourceKey: MANUAL_SOURCE_KEY,
    transaction
  });
};

const removeConfigurableSources = async (Model, relationField, relationId, transaction) => {
  await Model.update(
    { active: false, lastSeenAt: new Date() },
    {
      where: {
        [relationField]: relationId,
        sourceType: { [Op.in]: [SOURCE_TYPES.MANUAL, SOURCE_TYPES.LEGACY] },
        active: true
      },
      transaction
    }
  );
};

const removeManualSeasonTeam = async (seasonTeamId, transaction) => {
  await removeConfigurableSources(SeasonTeamSource, 'seasonTeamId', seasonTeamId, transaction);
  const touched = createTouchedMemberships();
  touched.seasonTeamIds.add(Number(seasonTeamId));
  const reconciliation = await reconcileMemberships(touched, transaction);
  const retained = !reconciliation.removedSeasonTeamIds.includes(Number(seasonTeamId));
  return {
    retained,
    sourceTypes: retained
      ? await activeSourceTypes(SeasonTeamSource, 'seasonTeamId', seasonTeamId, transaction)
      : []
  };
};

const removeManualSeasonTeamPlayer = async (seasonTeamPlayerId, transaction) => {
  await removeConfigurableSources(
    SeasonTeamPlayerSource,
    'seasonTeamPlayerId',
    seasonTeamPlayerId,
    transaction
  );
  const touched = createTouchedMemberships();
  touched.seasonTeamPlayerIds.add(Number(seasonTeamPlayerId));
  const reconciliation = await reconcileMemberships(touched, transaction);
  const retained = !reconciliation.removedSeasonTeamPlayerIds.includes(Number(seasonTeamPlayerId));
  return {
    retained,
    sourceTypes: retained
      ? await activeSourceTypes(
        SeasonTeamPlayerSource,
        'seasonTeamPlayerId',
        seasonTeamPlayerId,
        transaction
      )
      : []
  };
};

const isHardDeleteEligibleOrphan = ({ identityOrigin, orphanedAt }, now, graceDays) => {
  if (identityOrigin !== SOURCE_TYPES.MATCH || !orphanedAt) return false;
  const cutoff = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);
  return new Date(orphanedAt) <= cutoff;
};

const reconcileOrphanPlayers = async ({
  transaction,
  now = new Date(),
  graceDays = DEFAULT_ORPHAN_GRACE_DAYS
} = {}) => {
  const [players, statPlayerIds, membershipPlayerIds] = await Promise.all([
    Player.findAll({ attributes: ['id', 'identityOrigin', 'orphanedAt'], transaction }),
    PlayerStat.findAll({ attributes: ['playerId'], group: ['playerId'], transaction, raw: true }),
    SeasonTeamPlayer.findAll({ attributes: ['playerId'], group: ['playerId'], transaction, raw: true })
  ]);
  const referenced = new Set([
    ...statPlayerIds.map(row => Number(row.playerId)),
    ...membershipPlayerIds.map(row => Number(row.playerId))
  ]);
  const summary = {
    marked: [],
    restored: [],
    deleted: [],
    protectedLegacyOrManual: []
  };

  for (const player of players) {
    const id = Number(player.id);
    if (referenced.has(id)) {
      if (player.orphanedAt) {
        await player.update({ orphanedAt: null }, { transaction });
        summary.restored.push(id);
      }
      continue;
    }
    if (!player.orphanedAt) {
      await player.update({ orphanedAt: now }, { transaction });
      summary.marked.push(id);
      if (player.identityOrigin !== SOURCE_TYPES.MATCH) summary.protectedLegacyOrManual.push(id);
      continue;
    }
    if (isHardDeleteEligibleOrphan(player, now, graceDays)) {
      await player.destroy({ transaction });
      summary.deleted.push(id);
    } else if (player.identityOrigin !== SOURCE_TYPES.MATCH) {
      summary.protectedLegacyOrManual.push(id);
    }
  }
  return summary;
};

module.exports = {
  SOURCE_TYPES,
  MANUAL_SOURCE_KEY,
  LEGACY_SOURCE_KEY,
  DEFAULT_ORPHAN_GRACE_DAYS,
  activateSeasonTeamSource,
  activateSeasonTeamPlayerSource,
  ensureSeasonTeam,
  ensureSeasonTeamPlayer,
  deactivateMatchSources,
  createTouchedMemberships,
  mergeTouchedMemberships,
  reconcileMemberships,
  addManualSeasonTeam,
  addManualSeasonTeamPlayer,
  removeManualSeasonTeam,
  removeManualSeasonTeamPlayer,
  reconcileOrphanPlayers,
  isHardDeleteEligibleOrphan
};
