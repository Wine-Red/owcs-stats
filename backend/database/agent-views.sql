-- OWCS assistant-facing, live read-only views.
--
-- Execute this script after selecting the target OWCS database. The views stay
-- in the same schema as the source tables and never copy or mutate source data.
-- Dify must receive SELECT/SHOW VIEW grants on these views individually; never
-- grant it SELECT on the whole database.

CREATE OR REPLACE SQL SECURITY DEFINER VIEW `ai_v_seasons` AS
SELECT
  s.`id` AS `season_id`,
  s.`name` AS `season_name`,
  s.`stage` AS `season_stage`,
  s.`status` AS `season_status`
FROM `seasons` s;

CREATE OR REPLACE SQL SECURITY DEFINER VIEW `ai_v_season_teams` AS
SELECT
  s.`id` AS `season_id`,
  s.`name` AS `season_name`,
  s.`stage` AS `season_stage`,
  s.`status` AS `season_status`,
  t.`id` AS `team_id`,
  t.`name` AS `team_name`
FROM `season_teams` st
INNER JOIN `seasons` s ON s.`id` = st.`seasonId`
INNER JOIN `teams` t ON t.`id` = st.`teamId`;

CREATE OR REPLACE SQL SECURITY DEFINER VIEW `ai_v_team_roster` AS
SELECT
  s.`id` AS `season_id`,
  s.`name` AS `season_name`,
  s.`stage` AS `season_stage`,
  s.`status` AS `season_status`,
  t.`id` AS `team_id`,
  t.`name` AS `team_name`,
  p.`id` AS `player_id`,
  p.`name` AS `player_name`,
  p.`role` AS `player_role`
FROM `season_team_players` stp
INNER JOIN `season_teams` st ON st.`id` = stp.`seasonTeamId`
INNER JOIN `seasons` s ON s.`id` = st.`seasonId`
INNER JOIN `teams` t ON t.`id` = st.`teamId`
INNER JOIN `players` p ON p.`id` = stp.`playerId`;

CREATE OR REPLACE SQL SECURITY DEFINER VIEW `ai_v_matches` AS
SELECT
  mt.`id` AS `match_id`,
  s.`id` AS `season_id`,
  s.`name` AS `season_name`,
  s.`stage` AS `season_stage`,
  s.`status` AS `season_status`,
  mt.`matchDate` AS `match_date`,
  mt.`boFormat` AS `bo_format`,
  t1.`id` AS `team1_id`,
  t1.`name` AS `team1_name`,
  mt.`team1Score` AS `team1_score`,
  t2.`id` AS `team2_id`,
  t2.`name` AS `team2_name`,
  mt.`team2Score` AS `team2_score`,
  winner.`id` AS `winner_id`,
  winner.`name` AS `winner_name`,
  mt.`updatedAt` AS `data_updated_at`
FROM `matches` mt
INNER JOIN `seasons` s ON s.`id` = mt.`seasonId`
INNER JOIN `teams` t1 ON t1.`id` = mt.`team1Id`
INNER JOIN `teams` t2 ON t2.`id` = mt.`team2Id`
INNER JOIN `teams` winner ON winner.`id` = mt.`winnerId`;

CREATE OR REPLACE SQL SECURITY DEFINER VIEW `ai_v_map_games` AS
SELECT
  mg.`id` AS `map_game_id`,
  mt.`id` AS `match_id`,
  COALESCE(map_season.`id`, match_season.`id`) AS `season_id`,
  COALESCE(map_season.`name`, match_season.`name`) AS `season_name`,
  mt.`matchDate` AS `match_date`,
  m.`id` AS `map_id`,
  m.`name` AS `map_name`,
  m.`type` AS `map_type`,
  t1.`id` AS `team1_id`,
  t1.`name` AS `team1_name`,
  mg.`team1Score` AS `team1_score`,
  t2.`id` AS `team2_id`,
  t2.`name` AS `team2_name`,
  mg.`team2Score` AS `team2_score`,
  winner.`id` AS `winner_id`,
  winner.`name` AS `winner_name`,
  ban1.`name` AS `team1_ban_hero_name`,
  ban2.`name` AS `team2_ban_hero_name`,
  mg.`duration` AS `duration_seconds`,
  mg.`statsVersion` AS `stats_version`,
  mg.`updatedAt` AS `data_updated_at`
FROM `map_games` mg
LEFT JOIN `matches` mt ON mt.`id` = mg.`matchId`
LEFT JOIN `seasons` map_season ON map_season.`id` = mg.`seasonId`
LEFT JOIN `seasons` match_season ON match_season.`id` = mt.`seasonId`
INNER JOIN `maps` m ON m.`id` = mg.`mapId`
LEFT JOIN `teams` t1 ON t1.`id` = mg.`team1Id`
LEFT JOIN `teams` t2 ON t2.`id` = mg.`team2Id`
INNER JOIN `teams` winner ON winner.`id` = mg.`winnerId`
LEFT JOIN `heroes` ban1 ON ban1.`id` = mg.`team1BanHeroId`
LEFT JOIN `heroes` ban2 ON ban2.`id` = mg.`team2BanHeroId`;

CREATE OR REPLACE SQL SECURITY DEFINER VIEW `ai_v_player_map_stats` AS
SELECT
  ps.`id` AS `player_stat_id`,
  mg.`id` AS `map_game_id`,
  mt.`id` AS `match_id`,
  COALESCE(map_season.`id`, match_season.`id`) AS `season_id`,
  COALESCE(map_season.`name`, match_season.`name`) AS `season_name`,
  mt.`matchDate` AS `match_date`,
  m.`id` AS `map_id`,
  m.`name` AS `map_name`,
  m.`type` AS `map_type`,
  p.`id` AS `player_id`,
  p.`name` AS `player_name`,
  p.`role` AS `player_role`,
  t.`id` AS `team_id`,
  t.`name` AS `team_name`,
  mg.`duration` AS `map_duration_seconds`,
  mg.`statsVersion` AS `stats_version`,
  ps.`kills`,
  ps.`deaths`,
  ps.`assists`,
  ps.`damage`,
  ps.`healing`,
  ps.`mitigation`,
  ps.`ultsUsed` AS `ults_used`,
  ps.`finalBlows` AS `final_blows`,
  mg.`updatedAt` AS `data_updated_at`
FROM `player_stats` ps
INNER JOIN `map_games` mg ON mg.`id` = ps.`mapGameId`
LEFT JOIN `matches` mt ON mt.`id` = mg.`matchId`
LEFT JOIN `seasons` map_season ON map_season.`id` = mg.`seasonId`
LEFT JOIN `seasons` match_season ON match_season.`id` = mt.`seasonId`
INNER JOIN `maps` m ON m.`id` = mg.`mapId`
INNER JOIN `players` p ON p.`id` = ps.`playerId`
INNER JOIN `teams` t ON t.`id` = ps.`teamId`;

CREATE OR REPLACE SQL SECURITY DEFINER VIEW `ai_v_player_hero_stats` AS
SELECT
  phs.`id` AS `player_hero_stat_id`,
  ps.`id` AS `player_stat_id`,
  mg.`id` AS `map_game_id`,
  mt.`id` AS `match_id`,
  COALESCE(map_season.`id`, match_season.`id`) AS `season_id`,
  COALESCE(map_season.`name`, match_season.`name`) AS `season_name`,
  mt.`matchDate` AS `match_date`,
  m.`name` AS `map_name`,
  p.`id` AS `player_id`,
  p.`name` AS `player_name`,
  p.`role` AS `player_role`,
  t.`id` AS `team_id`,
  t.`name` AS `team_name`,
  phs.`heroId` AS `hero_id`,
  phs.`heroName` AS `hero_name`,
  h.`role` AS `hero_role`,
  h.`subRole` AS `hero_sub_role`,
  phs.`usageSeconds` AS `usage_seconds`,
  phs.`usagePercentage` AS `usage_percentage`,
  phs.`finalBlows` AS `final_blows`,
  phs.`deathsByFinalBlow` AS `deaths_by_final_blow`,
  phs.`ultReady` AS `ults_ready`,
  phs.`ultUsed` AS `ults_used`,
  phs.`avgUltChargeSeconds` AS `avg_ult_charge_seconds`,
  mg.`updatedAt` AS `data_updated_at`
FROM `player_hero_stats` phs
INNER JOIN `player_stats` ps ON ps.`id` = phs.`playerStatId`
INNER JOIN `map_games` mg ON mg.`id` = ps.`mapGameId`
LEFT JOIN `matches` mt ON mt.`id` = mg.`matchId`
LEFT JOIN `seasons` map_season ON map_season.`id` = mg.`seasonId`
LEFT JOIN `seasons` match_season ON match_season.`id` = mt.`seasonId`
INNER JOIN `maps` m ON m.`id` = mg.`mapId`
INNER JOIN `players` p ON p.`id` = ps.`playerId`
INNER JOIN `teams` t ON t.`id` = ps.`teamId`
LEFT JOIN `heroes` h ON h.`id` = phs.`heroId`;

CREATE OR REPLACE SQL SECURITY DEFINER VIEW `ai_v_match_coverage` AS
SELECT
  mt.`id` AS `match_id`,
  s.`id` AS `season_id`,
  s.`name` AS `season_name`,
  mt.`matchDate` AS `match_date`,
  t1.`name` AS `team1_name`,
  t2.`name` AS `team2_name`,
  COUNT(DISTINCT mg.`id`) AS `map_count`,
  COUNT(DISTINCT CASE WHEN ps.`id` IS NOT NULL THEN mg.`id` END) AS `maps_with_player_stats`,
  COUNT(DISTINCT ps.`id`) AS `player_stat_rows`,
  COUNT(DISTINCT CASE WHEN phs.`id` IS NOT NULL THEN mg.`id` END) AS `maps_with_hero_stats`,
  COUNT(DISTINCT phs.`id`) AS `player_hero_stat_rows`,
  MAX(mg.`updatedAt`) AS `latest_data_updated_at`
FROM `matches` mt
INNER JOIN `seasons` s ON s.`id` = mt.`seasonId`
INNER JOIN `teams` t1 ON t1.`id` = mt.`team1Id`
INNER JOIN `teams` t2 ON t2.`id` = mt.`team2Id`
LEFT JOIN `map_games` mg ON mg.`matchId` = mt.`id`
LEFT JOIN `player_stats` ps ON ps.`mapGameId` = mg.`id`
LEFT JOIN `player_hero_stats` phs ON phs.`playerStatId` = ps.`id`
GROUP BY
  mt.`id`,
  s.`id`,
  s.`name`,
  mt.`matchDate`,
  t1.`name`,
  t2.`name`;

CREATE OR REPLACE SQL SECURITY DEFINER VIEW `ai_v_season_data_coverage` AS
SELECT
  s.`id` AS `season_id`,
  s.`name` AS `season_name`,
  s.`status` AS `season_status`,
  COALESCE(match_data.`match_count`, 0) AS `match_count`,
  COALESCE(map_data.`map_game_count`, 0) AS `map_game_count`,
  COALESCE(player_data.`maps_with_player_stats`, 0) AS `maps_with_player_stats`,
  COALESCE(player_data.`player_stat_rows`, 0) AS `player_stat_rows`,
  COALESCE(player_data.`rows_with_nonzero_kills`, 0) AS `rows_with_nonzero_kills`,
  COALESCE(player_data.`rows_with_nonzero_deaths`, 0) AS `rows_with_nonzero_deaths`,
  COALESCE(player_data.`rows_with_nonzero_assists`, 0) AS `rows_with_nonzero_assists`,
  COALESCE(player_data.`rows_with_nonzero_damage`, 0) AS `rows_with_nonzero_damage`,
  COALESCE(player_data.`rows_with_nonzero_healing`, 0) AS `rows_with_nonzero_healing`,
  COALESCE(player_data.`rows_with_nonzero_mitigation`, 0) AS `rows_with_nonzero_mitigation`,
  COALESCE(player_data.`rows_with_nonzero_ults_used`, 0) AS `rows_with_nonzero_ults_used`,
  COALESCE(player_data.`rows_with_nonzero_final_blows`, 0) AS `rows_with_nonzero_final_blows`,
  COALESCE(hero_data.`maps_with_hero_stats`, 0) AS `maps_with_hero_stats`,
  COALESCE(hero_data.`player_hero_stat_rows`, 0) AS `player_hero_stat_rows`,
  GREATEST(
    COALESCE(match_data.`latest_data_updated_at`, '1970-01-01 00:00:00'),
    COALESCE(map_data.`latest_data_updated_at`, '1970-01-01 00:00:00')
  ) AS `latest_data_updated_at`
FROM `seasons` s
LEFT JOIN (
  SELECT
    mt.`seasonId` AS `season_id`,
    COUNT(*) AS `match_count`,
    MAX(mt.`updatedAt`) AS `latest_data_updated_at`
  FROM `matches` mt
  GROUP BY mt.`seasonId`
) match_data ON match_data.`season_id` = s.`id`
LEFT JOIN (
  SELECT
    COALESCE(mg.`seasonId`, mt.`seasonId`) AS `season_id`,
    COUNT(*) AS `map_game_count`,
    MAX(mg.`updatedAt`) AS `latest_data_updated_at`
  FROM `map_games` mg
  LEFT JOIN `matches` mt ON mt.`id` = mg.`matchId`
  GROUP BY COALESCE(mg.`seasonId`, mt.`seasonId`)
) map_data ON map_data.`season_id` = s.`id`
LEFT JOIN (
  SELECT
    COALESCE(mg.`seasonId`, mt.`seasonId`) AS `season_id`,
    COUNT(DISTINCT mg.`id`) AS `maps_with_player_stats`,
    COUNT(*) AS `player_stat_rows`,
    SUM(ps.`kills` <> 0) AS `rows_with_nonzero_kills`,
    SUM(ps.`deaths` <> 0) AS `rows_with_nonzero_deaths`,
    SUM(ps.`assists` <> 0) AS `rows_with_nonzero_assists`,
    SUM(ps.`damage` <> 0) AS `rows_with_nonzero_damage`,
    SUM(ps.`healing` <> 0) AS `rows_with_nonzero_healing`,
    SUM(ps.`mitigation` <> 0) AS `rows_with_nonzero_mitigation`,
    SUM(ps.`ultsUsed` <> 0) AS `rows_with_nonzero_ults_used`,
    SUM(ps.`finalBlows` <> 0) AS `rows_with_nonzero_final_blows`
  FROM `player_stats` ps
  INNER JOIN `map_games` mg ON mg.`id` = ps.`mapGameId`
  LEFT JOIN `matches` mt ON mt.`id` = mg.`matchId`
  GROUP BY COALESCE(mg.`seasonId`, mt.`seasonId`)
) player_data ON player_data.`season_id` = s.`id`
LEFT JOIN (
  SELECT
    COALESCE(mg.`seasonId`, mt.`seasonId`) AS `season_id`,
    COUNT(DISTINCT mg.`id`) AS `maps_with_hero_stats`,
    COUNT(*) AS `player_hero_stat_rows`
  FROM `player_hero_stats` phs
  INNER JOIN `player_stats` ps ON ps.`id` = phs.`playerStatId`
  INNER JOIN `map_games` mg ON mg.`id` = ps.`mapGameId`
  LEFT JOIN `matches` mt ON mt.`id` = mg.`matchId`
  GROUP BY COALESCE(mg.`seasonId`, mt.`seasonId`)
) hero_data ON hero_data.`season_id` = s.`id`;

CREATE OR REPLACE SQL SECURITY DEFINER VIEW `ai_v_data_freshness` AS
SELECT
  'matches' AS `dataset_name`,
  COUNT(*) AS `row_count`,
  MAX(mt.`updatedAt`) AS `latest_data_updated_at`
FROM `matches` mt
UNION ALL
SELECT
  'map_games' AS `dataset_name`,
  COUNT(*) AS `row_count`,
  MAX(mg.`updatedAt`) AS `latest_data_updated_at`
FROM `map_games` mg
UNION ALL
SELECT
  'player_stats' AS `dataset_name`,
  COUNT(*) AS `row_count`,
  MAX(mg.`updatedAt`) AS `latest_data_updated_at`
FROM `player_stats` ps
INNER JOIN `map_games` mg ON mg.`id` = ps.`mapGameId`
UNION ALL
SELECT
  'player_hero_stats' AS `dataset_name`,
  COUNT(*) AS `row_count`,
  MAX(mg.`updatedAt`) AS `latest_data_updated_at`
FROM `player_hero_stats` phs
INNER JOIN `player_stats` ps ON ps.`id` = phs.`playerStatId`
INNER JOIN `map_games` mg ON mg.`id` = ps.`mapGameId`;
