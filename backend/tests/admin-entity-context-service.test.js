const test = require('node:test');
const assert = require('node:assert/strict');

const Team = require('../models/Team');
const TeamAlias = require('../models/TeamAlias');
const Player = require('../models/Player');
const Match = require('../models/Match');
const MapGame = require('../models/MapGame');
const PlayerStat = require('../models/PlayerStat');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeamSource = require('../models/SeasonTeamSource');
const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource');
const { getTeamContext, getPlayerContext } = require('../services/AdminEntityContextService');

const row = value => ({ ...value, toJSON: () => ({ ...value }) });

const withMocks = async (mocks, run) => {
  const originals = mocks.map(([target, key]) => [target, key, target[key]]);
  mocks.forEach(([target, key, value]) => { target[key] = value; });
  try {
    return await run();
  } finally {
    originals.forEach(([target, key, value]) => { target[key] = value; });
  }
};

test('team admin context exposes aliases, membership evidence, roster and match history', async () => {
  const season = row({ id: 9, name: 'Stage 1', stage: 'Asia', status: 'in_progress' });
  const team = row({ id: 2, name: 'Canonical', region: 'Asia', logo: '/media/team.webp' });
  const opponent = row({ id: 3, name: 'Opponent', logo: null });
  const match = row({
    id: 40,
    matchDate: '2026-08-01',
    boFormat: 'BO5',
    team1Score: 3,
    team2Score: 1,
    winnerId: 2,
    Season: season,
    team1: team,
    team2: opponent
  });
  const seasonTeam = row({ id: 12, seasonId: 9, teamId: 2, Season: season });
  const membership = row({
    id: 18,
    seasonTeamId: 12,
    playerId: 7,
    joinDate: null,
    leaveDate: null,
    Player: row({ id: 7, name: 'Player', role: 'tank', identityOrigin: 'matchweb', orphanedAt: null })
  });

  await withMocks([
    [Team, 'findByPk', async () => team],
    [TeamAlias, 'findAll', async () => [{ teamId: 2, alias: 'ALT' }]],
    [SeasonTeam, 'findAll', async () => [seasonTeam]],
    [SeasonTeamSource, 'findAll', async () => [{ seasonTeamId: 12, sourceType: 'manual', firstSeenAt: 'a', lastSeenAt: 'b' }]],
    [SeasonTeamPlayer, 'findAll', async () => [membership]],
    [SeasonTeamPlayerSource, 'findAll', async () => [{ seasonTeamPlayerId: 18, sourceType: 'match', firstSeenAt: 'a', lastSeenAt: 'b' }]],
    [Match, 'findAll', async () => [match]],
    [Match, 'count', async () => 4],
    [MapGame, 'count', async () => 13],
    [PlayerStat, 'count', async () => 60]
  ], async () => {
    const context = await getTeamContext(2);
    assert.deepEqual(context.entity.aliases, ['ALT']);
    assert.equal(context.counts.matches, 4);
    assert.equal(context.memberships[0].sources[0].sourceType, 'manual');
    assert.equal(context.memberships[0].roster[0].player.name, 'Player');
    assert.equal(context.memberships[0].roster[0].sources[0].sourceType, 'match');
    assert.equal(context.recentMatches[0].team2.name, 'Opponent');
  });
});

test('player admin context reports historical teams and deduplicated match appearances', async () => {
  const player = row({ id: 7, name: 'Player', role: 'damage', identityOrigin: 'matchweb', orphanedAt: null });
  const season = row({ id: 9, name: 'Stage 1', stage: 'Asia', status: 'completed' });
  const team = row({ id: 2, name: 'Canonical', region: 'Asia', logo: null });
  const opponent = row({ id: 3, name: 'Opponent', logo: null });
  const membership = row({ id: 18, seasonTeamId: 12, playerId: 7, joinDate: null, leaveDate: null });
  const seasonTeam = row({ id: 12, seasonId: 9, teamId: 2, Season: season, Team: team });
  const match = row({
    id: 40,
    matchDate: '2026-08-01',
    boFormat: 'BO5',
    team1Score: 3,
    team2Score: 1,
    winnerId: 2,
    Season: season,
    team1: team,
    team2: opponent
  });

  await withMocks([
    [Player, 'findByPk', async () => player],
    [SeasonTeamPlayer, 'findAll', async () => [membership]],
    [SeasonTeamPlayerSource, 'findAll', async () => [{ seasonTeamPlayerId: 18, sourceType: 'match', firstSeenAt: 'a', lastSeenAt: 'b' }]],
    [SeasonTeam, 'findAll', async () => [seasonTeam]],
    [PlayerStat, 'findAll', async () => [
      { mapGameId: 20, teamId: 2 },
      { mapGameId: 21, teamId: 2 }
    ]],
    [MapGame, 'findAll', async () => [
      { id: 20, matchId: 40 },
      { id: 21, matchId: 40 }
    ]],
    [Match, 'findAll', async () => [match]]
  ], async () => {
    const context = await getPlayerContext(7);
    assert.equal(context.counts.matches, 1);
    assert.equal(context.counts.mapGames, 2);
    assert.equal(context.memberships[0].team.name, 'Canonical');
    assert.equal(context.memberships[0].sources[0].sourceType, 'match');
    assert.equal(context.recentMatches[0].appearanceTeamId, 2);
  });
});
