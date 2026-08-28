#!/usr/bin/env node
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

const query = sql => sequelize.query(sql, { type: QueryTypes.SELECT });

const main = async () => {
  await sequelize.authenticate();
  const [counts] = await query(`
    SELECT
      (SELECT COUNT(*) FROM season_teams) AS seasonTeams,
      (SELECT COUNT(*) FROM season_team_players) AS seasonTeamPlayers,
      (SELECT COUNT(*) FROM players) AS players,
      (SELECT COUNT(*) FROM player_stats) AS playerStats
  `);
  const legacyTeamCandidates = await query(`
    SELECT st.id AS seasonTeamId, s.id AS seasonId, s.name AS seasonName,
           t.id AS teamId, t.name AS teamName
    FROM season_teams st
    INNER JOIN seasons s ON s.id = st.seasonId
    INNER JOIN teams t ON t.id = st.teamId
    WHERE NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE m.seasonId = st.seasonId
        AND (m.team1Id = st.teamId OR m.team2Id = st.teamId)
    )
    ORDER BY s.id, t.name
  `);
  const legacyPlayerCandidates = await query(`
    SELECT stp.id AS seasonTeamPlayerId, s.id AS seasonId, s.name AS seasonName,
           t.id AS teamId, t.name AS teamName,
           p.id AS playerId, p.name AS playerName, p.role
    FROM season_team_players stp
    INNER JOIN season_teams st ON st.id = stp.seasonTeamId
    INNER JOIN seasons s ON s.id = st.seasonId
    INNER JOIN teams t ON t.id = st.teamId
    INNER JOIN players p ON p.id = stp.playerId
    WHERE NOT EXISTS (
      SELECT 1
      FROM player_stats ps
      INNER JOIN map_games mg ON mg.id = ps.mapGameId
      INNER JOIN matches m ON m.id = mg.matchId
      WHERE ps.playerId = stp.playerId
        AND ps.teamId = st.teamId
        AND m.seasonId = st.seasonId
    )
    ORDER BY s.id, t.name, p.role, p.name
  `);
  const orphanPlayers = await query(`
    SELECT p.id AS playerId, p.name AS playerName, p.role
    FROM players p
    WHERE NOT EXISTS (SELECT 1 FROM player_stats ps WHERE ps.playerId = p.id)
      AND NOT EXISTS (SELECT 1 FROM season_team_players stp WHERE stp.playerId = p.id)
    ORDER BY p.role, p.name
  `);
  const missingPlayerMemberships = await query(`
    SELECT DISTINCT m.seasonId, ps.teamId, ps.playerId, p.name AS playerName, p.role
    FROM player_stats ps
    INNER JOIN players p ON p.id = ps.playerId
    INNER JOIN map_games mg ON mg.id = ps.mapGameId
    INNER JOIN matches m ON m.id = mg.matchId
    LEFT JOIN season_teams st ON st.seasonId = m.seasonId AND st.teamId = ps.teamId
    LEFT JOIN season_team_players stp ON stp.seasonTeamId = st.id AND stp.playerId = ps.playerId
    WHERE st.id IS NULL OR stp.id IS NULL
    ORDER BY m.seasonId, ps.teamId, p.name
  `);
  const mismatchedPlayerStatTeams = await query(`
    SELECT DISTINCT m.id AS matchId, m.externalId, ps.teamId, ps.playerId,
           p.name AS playerName
    FROM player_stats ps
    INNER JOIN players p ON p.id = ps.playerId
    INNER JOIN map_games mg ON mg.id = ps.mapGameId
    INNER JOIN matches m ON m.id = mg.matchId
    WHERE ps.teamId NOT IN (m.team1Id, m.team2Id)
    ORDER BY m.id, ps.teamId, p.name
  `);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: 'read-only',
    counts,
    legacyTeamCandidates,
    legacyPlayerCandidates,
    orphanPlayers,
    missingPlayerMemberships,
    mismatchedPlayerStatTeams
  }, null, 2));
};

main()
  .then(() => sequelize.close())
  .catch(async error => {
    console.error(error);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
