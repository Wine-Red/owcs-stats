const Config = require('../models/Config');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeamSource = require('../models/SeasonTeamSource');
const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource');
const {
  SOURCE_TYPES,
  LEGACY_SOURCE_KEY,
  activateSeasonTeamSource,
  activateSeasonTeamPlayerSource,
  ensureSeasonTeam,
  ensureSeasonTeamPlayer
} = require('../services/MembershipSourceService');

const MIGRATION_KEY = 'membership_evidence_migration_v1';

const runMembershipEvidenceMigration = async sequelize => {
  const existing = await Config.findByPk(MIGRATION_KEY);
  if (existing) return { found: true, ...existing.value };

  return sequelize.transaction(async transaction => {
    const preexistingSeasonTeams = await SeasonTeam.findAll({ attributes: ['id'], transaction, raw: true });
    const preexistingSeasonTeamPlayers = await SeasonTeamPlayer.findAll({ attributes: ['id'], transaction, raw: true });
    const [matches, mapGames, playerStats] = await Promise.all([
      Match.findAll({
        attributes: ['id', 'externalId', 'seasonId', 'team1Id', 'team2Id'],
        transaction,
        raw: true
      }),
      MapGame.findAll({ attributes: ['id', 'matchId'], transaction, raw: true }),
      PlayerStat.findAll({ attributes: ['mapGameId', 'playerId', 'teamId'], transaction, raw: true })
    ]);
    const matchById = new Map(matches.map(match => [Number(match.id), match]));
    const matchByMapGameId = new Map(
      mapGames.map(mapGame => [Number(mapGame.id), matchById.get(Number(mapGame.matchId))])
    );
    const seasonTeamByKey = new Map();
    const anomalies = [];
    let matchTeamSources = 0;
    let matchPlayerSources = 0;

    const ensureMatchSeasonTeam = async (match, teamId) => {
      const key = `${match.seasonId}:${teamId}`;
      let seasonTeam = seasonTeamByKey.get(key);
      if (!seasonTeam) {
        const result = await ensureSeasonTeam({
          seasonId: match.seasonId,
          teamId,
          sourceType: SOURCE_TYPES.MATCH,
          sourceKey: match.externalId,
          transaction
        });
        seasonTeam = result.seasonTeam;
        seasonTeamByKey.set(key, seasonTeam);
        if (result.sourceCreated) matchTeamSources++;
      } else {
        const result = await activateSeasonTeamSource(
          seasonTeam.id,
          SOURCE_TYPES.MATCH,
          match.externalId,
          transaction
        );
        if (result.created) matchTeamSources++;
      }
      return seasonTeam;
    };

    for (const match of matches) {
      if (!match.externalId) {
        anomalies.push({ type: 'match_without_external_id', matchId: Number(match.id) });
        continue;
      }
      await ensureMatchSeasonTeam(match, Number(match.team1Id));
      await ensureMatchSeasonTeam(match, Number(match.team2Id));
    }

    const seenPlayerEvidence = new Set();
    for (const stat of playerStats) {
      const match = matchByMapGameId.get(Number(stat.mapGameId));
      if (!match?.externalId) continue;
      const teamId = Number(stat.teamId);
      if (![Number(match.team1Id), Number(match.team2Id)].includes(teamId)) {
        anomalies.push({
          type: 'player_stat_team_mismatch',
          matchId: Number(match.id),
          externalId: String(match.externalId),
          playerId: Number(stat.playerId),
          teamId
        });
        continue;
      }
      const evidenceKey = `${match.externalId}:${teamId}:${stat.playerId}`;
      if (seenPlayerEvidence.has(evidenceKey)) continue;
      seenPlayerEvidence.add(evidenceKey);
      const seasonTeam = await ensureMatchSeasonTeam(match, teamId);
      const result = await ensureSeasonTeamPlayer({
        seasonTeam,
        playerId: Number(stat.playerId),
        sourceType: SOURCE_TYPES.MATCH,
        sourceKey: match.externalId,
        transaction
      });
      if (result.sourceCreated) matchPlayerSources++;
    }

    let legacyTeamSources = 0;
    for (const row of preexistingSeasonTeams) {
      const activeCount = await SeasonTeamSource.count({
        where: { seasonTeamId: row.id, active: true },
        transaction
      });
      if (activeCount === 0) {
        const result = await activateSeasonTeamSource(
          row.id,
          SOURCE_TYPES.LEGACY,
          LEGACY_SOURCE_KEY,
          transaction
        );
        if (result.created) legacyTeamSources++;
      }
    }

    let legacyPlayerSources = 0;
    for (const row of preexistingSeasonTeamPlayers) {
      const activeCount = await SeasonTeamPlayerSource.count({
        where: { seasonTeamPlayerId: row.id, active: true },
        transaction
      });
      if (activeCount === 0) {
        const result = await activateSeasonTeamPlayerSource(
          row.id,
          SOURCE_TYPES.LEGACY,
          LEGACY_SOURCE_KEY,
          transaction
        );
        if (result.created) legacyPlayerSources++;
      }
    }

    const summary = {
      migratedAt: new Date().toISOString(),
      matchTeamSources,
      matchPlayerSources,
      legacyTeamSources,
      legacyPlayerSources,
      anomalies: anomalies.slice(0, 200),
      anomalyCount: anomalies.length
    };
    await Config.create({
      key: MIGRATION_KEY,
      value: summary,
      description: 'Membership evidence baseline; legacy rows are retained until explicitly reviewed'
    }, { transaction });
    return { found: false, ...summary };
  });
};

const getMembershipEvidenceAudit = async ({ transaction } = {}) => {
  const [activeTeamSources, activePlayerSources, unreferencedLegacyPlayers] = await Promise.all([
    SeasonTeamSource.count({ where: { active: true }, transaction }),
    SeasonTeamPlayerSource.count({ where: { active: true }, transaction }),
    SeasonTeamPlayer.findAll({
      include: [{
        model: SeasonTeamPlayerSource,
        as: 'sources',
        where: { active: true, sourceType: SOURCE_TYPES.LEGACY },
        required: true,
        attributes: []
      }],
      attributes: ['id', 'seasonTeamId', 'playerId'],
      transaction,
      raw: true
    })
  ]);
  return { activeTeamSources, activePlayerSources, legacyPlayerRelations: unreferencedLegacyPlayers };
};

module.exports = { MIGRATION_KEY, runMembershipEvidenceMigration, getMembershipEvidenceAudit };
