-- Synthetic fixtures. Loaded only into a disposable owcs_data_api_test_* database.
-- No ai_v_* views are created: the public API must depend exclusively on tables.
CREATE TABLE seasons (id INT PRIMARY KEY, name VARCHAR(255), status VARCHAR(30), externalEventName VARCHAR(255));
CREATE TABLE teams (id INT PRIMARY KEY, name VARCHAR(255));
CREATE TABLE team_aliases (id INT PRIMARY KEY, teamId INT, alias VARCHAR(191));
CREATE TABLE players (id INT PRIMARY KEY, name VARCHAR(255), role VARCHAR(30));
CREATE TABLE maps (id INT PRIMARY KEY, name VARCHAR(255), type VARCHAR(30));
CREATE TABLE heroes (id INT PRIMARY KEY, name VARCHAR(255), role VARCHAR(30), subRole VARCHAR(50));
CREATE TABLE season_stages (id INT PRIMARY KEY, seasonId INT, name VARCHAR(255), startMatchId INT);
CREATE TABLE season_teams (id INT PRIMARY KEY, seasonId INT, teamId INT);
CREATE TABLE season_team_players (id INT PRIMARY KEY, seasonTeamId INT, playerId INT);
CREATE TABLE matches (id INT PRIMARY KEY, seasonId INT, matchDate DATE, boFormat VARCHAR(30), team1Id INT, team2Id INT, team1Score INT, team2Score INT, winnerId INT);
CREATE TABLE map_games (id INT PRIMARY KEY, matchId INT, seasonId INT, mapId INT, team1Id INT, team2Id INT, team1Score INT, team2Score INT, winnerId INT,
  team1BanHeroId INT, team2BanHeroId INT, duration FLOAT, externalRoundIndex INT, replayId VARCHAR(255));
CREATE TABLE player_stats (id INT PRIMARY KEY, mapGameId INT, teamId INT, playerId INT, kills INT, assists INT, deaths INT, damage INT, healing INT, mitigation INT);
CREATE TABLE player_hero_stats (id INT PRIMARY KEY, playerStatId INT, heroId INT, heroName VARCHAR(255), usageSeconds INT, usagePercentage FLOAT,
  finalBlows INT, deathsByFinalBlow INT, ultReady INT, ultUsed INT, avgUltChargeSeconds FLOAT);

INSERT INTO seasons VALUES (1, 'Cup One', 'completed', 'External Cup'), (2, 'Cup Empty', 'in_progress', NULL);
INSERT INTO teams VALUES (1, 'Alpha'), (2, 'Beta'), (3, 'Gamma'), (4, '100%_   Club');
INSERT INTO team_aliases VALUES (1, 1, 'A Team'), (2, 1, 'Known Alias');
INSERT INTO players VALUES (1, 'Shared', 'tank'), (2, 'Shared', 'damage'), (3, 'P3', 'damage'), (4, 'P4', 'support'), (5, 'P5', 'support'),
  (6, 'P6', 'tank'), (7, 'P7', 'damage'), (8, 'P8', 'damage'), (9, 'P9', 'support'), (10, 'P10', 'support'), (11, 'Bench', 'tank'), (12, 'Transfer', 'tank');
INSERT INTO maps VALUES (1, 'Nepal', '占领要点'), (2, 'Colosseo', '机动推进');
INSERT INTO heroes VALUES (1, 'Ana', 'support', NULL), (2, 'Tracer', 'damage', 'flanker');
INSERT INTO season_stages VALUES (1, 1, 'Group', NULL), (2, 1, 'Finals', 2), (3, 2, 'Opening', NULL);
INSERT INTO season_teams VALUES (1, 1, 1), (2, 1, 2), (3, 2, 1);
INSERT INTO season_team_players VALUES (1, 1, 1), (2, 1, 2), (3, 1, 3), (4, 1, 4), (5, 1, 5), (6, 2, 6), (7, 2, 7), (8, 2, 8), (9, 2, 9), (10, 2, 10), (11, 1, 11), (12, 3, 12);
INSERT INTO matches VALUES
  (1, 1, '2026-09-01', 'BO3', 1, 2, 2, 1, 1), (2, 1, '2026-09-02', 'BO3', 2, 1, 0, 1, 1),
  (3, 1, '2026-09-02', 'BO3', 1, 2, 1, 0, 1), (4, 1, '2026-08-30', NULL, 1, 3, 1, 0, 1);
INSERT INTO map_games VALUES
  (11, 1, 1, 1, 1, 2, 2, 0, 1, 1, NULL, 9.98333, 0, 'ABC123'),
  (12, 1, 1, 2, 1, 2, 81, 81, 2, NULL, 2, 12.5, 1, NULL),
  (13, 1, 1, 1, 1, 2, 2, 0, 1, NULL, NULL, 0, NULL, NULL),
  (21, 2, 1, 2, 2, 1, 0, 1, 1, NULL, NULL, 10, 0, NULL),
  (31, 3, 1, 1, 1, 2, 0, 2, 2, NULL, NULL, 10, 0, NULL);
INSERT INTO player_stats VALUES
  (101, 11, 1, 1, 10, 0, 3, 100, 0, 100), (102, 11, 1, 2, 11, 0, 4, 200, 0, 0),
  (103, 11, 1, 3, 12, 0, 5, 300, 0, 0), (104, 11, 1, 4, 13, 1, 6, 400, 1000, 0),
  (105, 11, 1, 5, 14, 1, 7, 500, 2000, 0), (106, 11, 2, 6, 15, 0, 8, 600, 0, 600),
  (107, 11, 2, 7, 16, 0, 9, 700, 0, 0), (108, 11, 2, 8, 17, 0, 10, 800, 0, 0),
  (109, 11, 2, 9, 18, 1, 11, 900, 3000, 0), (110, 11, 2, 10, 19, 1, 12, 1000, 4000, 0),
  (201, 12, 2, 6, 1, 0, 1, 100, 0, 0), (301, 21, 1, 1, 1, 0, 1, 100, 0, 0), (401, 31, 2, 1, 1, 0, 1, 100, 0, 0);
INSERT INTO player_hero_stats VALUES
  (1, 101, 1, 'Ana', 50, 50, 1, 2, 1, 0, NULL), (2, 101, NULL, 'Unmapped', 31, 31, 0, 0, 0, 0, NULL);
