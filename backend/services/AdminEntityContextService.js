const { Op } = require('sequelize');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Season = require('../models/Season');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeamSource = require('../models/SeasonTeamSource');
const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource');
const { serializeTeamsWithAliases } = require('./TeamAliasService');

const groupSources = (rows, key) => {
  const grouped = new Map();
  rows.forEach(row => {
    const relationId = Number(row[key]);
    if (!grouped.has(relationId)) grouped.set(relationId, []);
    grouped.get(relationId).push({
      sourceType: row.sourceType,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt
    });
  });
  return grouped;
};

const serializeMatch = row => ({
  id: row.id,
  matchDate: row.matchDate,
  boFormat: row.boFormat,
  team1Score: row.team1Score,
  team2Score: row.team2Score,
  winnerId: row.winnerId,
  season: row.Season ? { id: row.Season.id, name: row.Season.name } : null,
  team1: row.team1 ? { id: row.team1.id, name: row.team1.name, logo: row.team1.logo } : null,
  team2: row.team2 ? { id: row.team2.id, name: row.team2.name, logo: row.team2.logo } : null
});

const loadMatches = async where => Match.findAll({
  where,
  include: [
    { model: Season, attributes: ['id', 'name'] },
    { model: Team, as: 'team1', attributes: ['id', 'name', 'logo'] },
    { model: Team, as: 'team2', attributes: ['id', 'name', 'logo'] }
  ],
  order: [['matchDate', 'DESC'], ['id', 'DESC']],
  limit: 20
});

const getTeamContext = async teamId => {
  const team = await Team.findByPk(teamId);
  if (!team) return null;

  const seasonTeams = await SeasonTeam.findAll({
    where: { teamId },
    include: [{ model: Season, as: 'Season', attributes: ['id', 'name', 'stage', 'status'] }],
    order: [['seasonId', 'DESC']]
  });
  const seasonTeamIds = seasonTeams.map(row => Number(row.id));
  const [teamSources, rosterRows, recentMatches, mapGames, statRows] = await Promise.all([
    seasonTeamIds.length
      ? SeasonTeamSource.findAll({ where: { seasonTeamId: { [Op.in]: seasonTeamIds }, active: true }, raw: true })
      : [],
    seasonTeamIds.length
      ? SeasonTeamPlayer.findAll({
        where: { seasonTeamId: { [Op.in]: seasonTeamIds } },
        include: [{ model: Player, attributes: ['id', 'name', 'role', 'identityOrigin', 'orphanedAt'] }]
      })
      : [],
    loadMatches({ [Op.or]: [{ team1Id: teamId }, { team2Id: teamId }] }),
    MapGame.count({ where: { [Op.or]: [{ team1Id: teamId }, { team2Id: teamId }] } }),
    PlayerStat.count({ where: { teamId } })
  ]);

  const rosterIds = rosterRows.map(row => Number(row.id));
  const rosterSources = rosterIds.length
    ? await SeasonTeamPlayerSource.findAll({
      where: { seasonTeamPlayerId: { [Op.in]: rosterIds }, active: true },
      raw: true
    })
    : [];
  const teamSourcesByRelation = groupSources(teamSources, 'seasonTeamId');
  const rosterSourcesByRelation = groupSources(rosterSources, 'seasonTeamPlayerId');
  const rosterBySeasonTeam = new Map();
  rosterRows.forEach(row => {
    const relationId = Number(row.seasonTeamId);
    if (!rosterBySeasonTeam.has(relationId)) rosterBySeasonTeam.set(relationId, []);
    rosterBySeasonTeam.get(relationId).push({
      relationId: row.id,
      joinDate: row.joinDate,
      leaveDate: row.leaveDate,
      player: row.Player ? {
        id: row.Player.id,
        name: row.Player.name,
        role: row.Player.role,
        identityOrigin: row.Player.identityOrigin,
        orphanedAt: row.Player.orphanedAt
      } : null,
      sources: rosterSourcesByRelation.get(Number(row.id)) || []
    });
  });

  return {
    entity: await serializeTeamsWithAliases(team),
    counts: {
      seasons: seasonTeams.length,
      rosterRelations: rosterRows.length,
      matches: await Match.count({ where: { [Op.or]: [{ team1Id: teamId }, { team2Id: teamId }] } }),
      mapGames,
      statRows
    },
    memberships: seasonTeams.map(row => ({
      id: row.id,
      seasonId: row.seasonId,
      season: row.Season ? {
        id: row.Season.id,
        name: row.Season.name,
        stage: row.Season.stage,
        status: row.Season.status
      } : null,
      sources: teamSourcesByRelation.get(Number(row.id)) || [],
      roster: rosterBySeasonTeam.get(Number(row.id)) || []
    })),
    recentMatches: recentMatches.map(serializeMatch)
  };
};

const getPlayerContext = async playerId => {
  const player = await Player.findByPk(playerId);
  if (!player) return null;

  const membershipRows = await SeasonTeamPlayer.findAll({ where: { playerId } });
  const membershipIds = membershipRows.map(row => Number(row.id));
  const seasonTeamIds = [...new Set(membershipRows.map(row => Number(row.seasonTeamId)))];
  const [membershipSources, seasonTeams, statRows] = await Promise.all([
    membershipIds.length
      ? SeasonTeamPlayerSource.findAll({
        where: { seasonTeamPlayerId: { [Op.in]: membershipIds }, active: true },
        raw: true
      })
      : [],
    seasonTeamIds.length
      ? SeasonTeam.findAll({
        where: { id: { [Op.in]: seasonTeamIds } },
        include: [
          { model: Season, as: 'Season', attributes: ['id', 'name', 'stage', 'status'] },
          { model: Team, as: 'Team', attributes: ['id', 'name', 'region', 'logo'] }
        ]
      })
      : [],
    PlayerStat.findAll({ where: { playerId }, attributes: ['mapGameId', 'teamId'], raw: true })
  ]);

  const seasonTeamMap = new Map(seasonTeams.map(row => [Number(row.id), row]));
  const sourcesByMembership = groupSources(membershipSources, 'seasonTeamPlayerId');
  const mapGameIds = [...new Set(statRows.map(row => Number(row.mapGameId)).filter(Boolean))];
  const mapGames = mapGameIds.length
    ? await MapGame.findAll({ where: { id: { [Op.in]: mapGameIds } }, attributes: ['id', 'matchId'] , raw: true })
    : [];
  const matchIds = [...new Set(mapGames.map(row => Number(row.matchId)).filter(Boolean))];
  const recentMatches = matchIds.length
    ? await loadMatches({ id: { [Op.in]: matchIds } })
    : [];
  const appearanceTeamByMatch = new Map();
  const mapGameToMatch = new Map(mapGames.map(row => [Number(row.id), Number(row.matchId)]));
  statRows.forEach(row => {
    const matchId = mapGameToMatch.get(Number(row.mapGameId));
    if (matchId && !appearanceTeamByMatch.has(matchId)) appearanceTeamByMatch.set(matchId, Number(row.teamId));
  });

  const memberships = membershipRows.map(row => {
    const seasonTeam = seasonTeamMap.get(Number(row.seasonTeamId));
    return {
      id: row.id,
      joinDate: row.joinDate,
      leaveDate: row.leaveDate,
      seasonTeamId: row.seasonTeamId,
      season: seasonTeam?.Season ? {
        id: seasonTeam.Season.id,
        name: seasonTeam.Season.name,
        stage: seasonTeam.Season.stage,
        status: seasonTeam.Season.status
      } : null,
      team: seasonTeam?.Team ? {
        id: seasonTeam.Team.id,
        name: seasonTeam.Team.name,
        region: seasonTeam.Team.region,
        logo: seasonTeam.Team.logo
      } : null,
      sources: sourcesByMembership.get(Number(row.id)) || []
    };
  });

  return {
    entity: player.toJSON(),
    counts: {
      memberships: memberships.length,
      seasons: new Set(memberships.map(row => row.season?.id).filter(Boolean)).size,
      teams: new Set(memberships.map(row => row.team?.id).filter(Boolean)).size,
      matches: matchIds.length,
      mapGames: mapGameIds.length,
      statRows: statRows.length
    },
    memberships: memberships.sort((a, b) => Number(b.season?.id || 0) - Number(a.season?.id || 0)),
    recentMatches: recentMatches.map(row => ({
      ...serializeMatch(row),
      appearanceTeamId: appearanceTeamByMatch.get(Number(row.id)) || null
    }))
  };
};

module.exports = { getTeamContext, getPlayerContext };
