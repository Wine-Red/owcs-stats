const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const isolatedMysql = process.env.OWCS_ISOLATED_MYSQL === '1' && Boolean(process.env.DATA_API_TEST_DB_PORT);

test('identity merge against isolated MySQL tables: migration, rollback, replay and concurrency', {
  skip: process.env.ENTITY_MERGE_TEST_MYSQL !== '1' && !isolatedMysql
}, async t => {
  let env, isolatedAdmin, isolatedDatabase, sequelize, prefix, namespaceReady = false;
  t.after(async () => {
    try {
      if (sequelize) {
        try {
          if (namespaceReady) {
            for (const model of Object.values(sequelize.models)) assert.ok(model.getTableName().startsWith(prefix));
            await sequelize.drop();
          }
        } finally { await sequelize.close(); }
      }
    } finally {
      if (isolatedAdmin) {
        assert.match(isolatedDatabase, /^owcs_identity_merge_test_\d+_\d+$/);
        try { await isolatedAdmin.query(`DROP DATABASE IF EXISTS \`${isolatedDatabase}\``); }
        finally { await isolatedAdmin.end(); }
      }
    }
  });
  if (isolatedMysql) {
    env = {
      DB_HOST: process.env.DATA_API_TEST_DB_HOST || '127.0.0.1',
      DB_PORT: process.env.DATA_API_TEST_DB_PORT,
      DB_USER: process.env.DATA_API_TEST_DB_USER || 'root',
      DB_PASSWORD: process.env.DATA_API_TEST_DB_PASSWORD || '',
      DB_NAME: `owcs_identity_merge_test_${process.pid}_${Date.now()}`
    };
    isolatedDatabase = env.DB_NAME;
    assert.match(isolatedDatabase, /^owcs_identity_merge_test_\d+_\d+$/);
    isolatedAdmin = await require('mysql2/promise').createConnection({
      host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD
    });
    await isolatedAdmin.query(`CREATE DATABASE \`${isolatedDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } else {
    env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
    assert.ok(['127.0.0.1', 'localhost', '::1'].includes(env.DB_HOST));
    assert.equal(env.DB_NAME, 'localstats');
  }
  Object.assign(process.env, env, { NODE_ENV: 'test' });
  sequelize = require('../config/database');
  const { setupAssociations } = require('../database');
  const service = require('../services/EntityMergeService');
  const { migrateEntityIdentities } = require('../database/entityIdentityMigration');
  const identity = require('../models/EntityIdentity');
  const { identityTransaction } = require('../services/IdentityWriteService');
  const { resolveCanonicalId, serializePlayersWithAliases } = require('../services/PlayerIdentityService');
  const { createIncrementalMatchSyncService } = require('../services/IncrementalMatchSyncService');
  const { MODELS: m } = service;
  const Season = require('../models/Season'), Map = require('../models/Map');
  const PlayerHeroStat = require('../models/PlayerHeroStat'), Timeline = require('../models/MapGameTimeline');
  setupAssociations();

  // The local app account can only use localstats. Remap EVERY registered model and
  // every FK to a unique table namespace; never sync or drop the real tables.
  prefix = `em_${randomBytes(4).toString('hex')}_`;
  const tableNames = new global.Map(Object.values(sequelize.models).map(model => [model.getTableName(), prefix + model.getTableName()]));
  for (const model of Object.values(sequelize.models)) {
    const name = tableNames.get(model.getTableName());
    assert.ok(name.startsWith(prefix));
    model.tableName = name; model.options.tableName = name;
    for (const attribute of Object.values(model.rawAttributes)) if (attribute.references) {
      const old = attribute.references.model;
      const oldName = typeof old === 'string' ? old : old.tableName;
      const next = oldName.startsWith(prefix) ? oldName : tableNames.get(oldName);
      assert.ok(next?.startsWith(prefix), `unmapped FK ${String(old)}`);
      attribute.references.model = next;
    }
    model.refreshAttributes();
  }
  namespaceReady = true;
  await sequelize.sync();
  await t.test('legacy global ID indexes migrate to role indexes without changing IDs', async () => {
    const qi = sequelize.getQueryInterface();
    const player = await m.players.create({ name: 'Migration Fixture', externalId: 'migration-id', role: 'support' });
    await identity.PlayerExternalIdentity.create({ playerId: player.id, source: 'matchweb', externalId: 'migration-id', normalizedExternalId: 'migration-id', role: 'support' });
    await qi.removeIndex(tableNames.get('players'), 'uq_player_external_role');
    await qi.addIndex(tableNames.get('players'), ['externalId'], { name: 'legacy_external_id', unique: true });
    await qi.removeIndex(tableNames.get('player_external_identities'), 'uq_player_source_role_identity');
    await qi.addIndex(tableNames.get('player_external_identities'), ['source', 'normalizedExternalId'], { name: 'uq_player_source_identity', unique: true });
    await qi.removeColumn(tableNames.get('player_external_identities'), 'role');
    const adapter = {
      getQueryInterface: () => new Proxy(qi, { get(target, key) {
        if (key === 'showAllTables') return async () => [...tableNames.keys()];
        return (...args) => target[key](tableNames.get(args[0]) || args[0], ...args.slice(1));
      } }),
      query: sql => sequelize.query(sql.replace(/player_external_identities|players/g, name => tableNames.get(name)))
    };
    const { ensurePlayerRoleIdentitySchema } = require('../database/playerRoleIdentityMigration');
    await ensurePlayerRoleIdentitySchema(adapter);
    await ensurePlayerRoleIdentitySchema(adapter);
    const restored = await identity.PlayerExternalIdentity.findOne({ where: { playerId: player.id } });
    assert.equal(restored.role, 'support');
    assert.equal((await player.reload()).externalId, 'migration-id');
    const damage = await m.players.create({ name: player.name, externalId: player.externalId, role: 'damage' });
    await identity.PlayerExternalIdentity.create({ playerId: damage.id, source: 'matchweb', externalId: 'migration-id', normalizedExternalId: 'migration-id', role: 'damage' });
    await assert.rejects(m.players.create({ name: 'Duplicate', externalId: 'migration-id', role: 'damage' }), { name: 'SequelizeUniqueConstraintError' });
    await identity.PlayerExternalIdentity.destroy({ where: { normalizedExternalId: 'migration-id' } });
    await damage.destroy();
    await player.destroy();
  });
  await migrateEntityIdentities();
  const season = await Season.create({ name: 'Merge Fixture' });
  const map = await Map.create({ name: 'Fixture Map', type: '占领要点' });
  const makeTeam = name => m.teams.create({ name, region: 'KR' });
  const makePlayer = (name, externalId) => m.players.create({ name, externalId, role: 'support', identityOrigin: 'match' });
  const opponent = await makeTeam('Opponent');
  const gameFor = async (team, player) => {
    const match = await m.matches.create({ seasonId: season.id, team1Id: team.id, team2Id: opponent.id, winnerId: team.id, matchDate: '2026-09-01', team1Score: 1, team2Score: 0 });
    const game = await m.map_games.create({ matchId: match.id, seasonId: season.id, mapId: map.id, team1Id: team.id, team2Id: opponent.id, winnerId: team.id });
    const stat = await m.player_stats.create({ mapGameId: game.id, playerId: player.id, teamId: team.id, kills: 23, deaths: 2 });
    return { match, game, stat };
  };
  const source = await makeTeam('ZSG'), target = await makeTeam('ZAN');
  const oldPlayer = await makePlayer('Old Player', 'player-old'), player = await makePlayer('Current Player', 'player-new');
  await migrateEntityIdentities();
  await migrateEntityIdentities();
  assert.equal(await identity.PlayerExternalIdentity.count(), 2);
  const originalGame = await gameFor(source, oldPlayer);
  await gameFor(target, player);
  const heroStat = await PlayerHeroStat.create({ playerStatId: originalGame.stat.id, heroName: 'Unregistered', usageSeconds: 100, avgUltChargeSeconds: null });
  const timeline = await Timeline.create({ mapGameId: originalGame.game.id, schemaVersion: 1, revision: 3, digest: 'a'.repeat(64), sourceTaskId: 'fixture', payload: { players: [{ playerId: 'player-old' }], events: [] } });
  const timelineBefore = (await timeline.reload()).toJSON();
  const membership = await m.season_teams.create({ seasonId: season.id, teamId: source.id });
  const targetMembership = await m.season_teams.create({ seasonId: season.id, teamId: target.id });
  const oldRoster = await m.season_team_players.create({ seasonTeamId: membership.id, playerId: oldPlayer.id });
  await m.season_team_players.create({ seasonTeamId: targetMembership.id, playerId: oldPlayer.id });
  await m.season_team_players.create({ seasonTeamId: targetMembership.id, playerId: player.id });
  await m.season_team_sources.create({ seasonTeamId: membership.id, sourceType: 'manual', sourceKey: 'admin' });
  await m.season_team_sources.create({ seasonTeamId: targetMembership.id, sourceType: 'match', sourceKey: 'fixture-match' });
  await m.season_team_player_sources.create({ seasonTeamPlayerId: oldRoster.id, sourceType: 'manual', sourceKey: 'admin' });
  const poll = await m.match_polls.create({ sourceId: 'poll', sourcePage: 'fixture', sourceGroup: 'final', seasonId: season.id,
    team1Id: source.id, team2Id: opponent.id, pairKey: [source.id, opponent.id].sort((a, b) => a - b).join(':'), scheduledAt: new Date() });
  await m.match_votes.create({ pollId: poll.id, teamId: source.id, voterHash: 'visitor' });

  await t.test('stale preview cannot write; successful team merge preserves votes and source evidence', async () => {
    const stale = await service.previewMerge('team', source.id, target.id);
    await source.update({ region: 'AP' });
    await assert.rejects(service.applyMerge('team', source.id, target.id, stale.fingerprint), { code: 'MERGE_PREVIEW_STALE' });
    assert.ok(await m.teams.findByPk(source.id));
    const preview = await service.previewMerge('team', source.id, target.id);
    assert.equal(preview.canMerge, true, JSON.stringify(preview.conflicts));
    const applied = await service.applyMerge('team', source.id, target.id, preview.fingerprint);
    assert.ok(applied.auditId);
    assert.equal((await service.applyMerge('team', source.id, target.id, preview.fingerprint)).alreadyApplied, true);
    assert.equal(await m.teams.findByPk(source.id), null);
    assert.equal(await resolveCanonicalId('team', source.id), target.id);
    assert.equal((await originalGame.match.reload()).winnerId, target.id);
    assert.equal((await originalGame.stat.reload()).teamId, target.id);
    assert.equal((await originalGame.stat.reload()).kills, 23);
    assert.equal((await poll.reload()).team1Id, target.id);
    assert.equal((await m.match_votes.findOne()).teamId, target.id);
    assert.equal(await m.season_teams.count({ where: { teamId: target.id } }), 1);
    assert.equal(await m.season_team_sources.count({ where: { seasonTeamId: targetMembership.id } }), 2);
    assert.equal(await m.season_team_player_sources.count(), 1);
  });
  await t.test('a failure after partial mutations rolls the whole transaction and audit back', async () => {
    const preview = await service.previewMerge('player', oldPlayer.id, player.id);
    const beforeAudits = await identity.EntityMergeAudit.count();
    const hookName = 'identity-merge-failure';
    m.players.addHook('beforeBulkDestroy', hookName, () => { throw new Error('injected failure'); });
    try { await assert.rejects(service.applyMerge('player', oldPlayer.id, player.id, preview.fingerprint), /injected failure/); }
    finally { m.players.removeHook('beforeBulkDestroy', hookName); }
    assert.equal(await identity.EntityMergeAudit.count(), beforeAudits);
    assert.equal((await originalGame.stat.reload()).playerId, oldPlayer.id);
    assert.equal((await m.players.findByPk(oldPlayer.id)).externalId, 'player-old');
  });
  await t.test('player merge keeps multiple external IDs, stat IDs, hero metrics and raw timelines', async () => {
    const preview = await service.previewMerge('player', oldPlayer.id, player.id);
    const applied = await service.applyMerge('player', oldPlayer.id, player.id, preview.fingerprint);
    assert.ok(applied.auditId);
    assert.equal((await originalGame.stat.reload()).playerId, player.id);
    assert.equal((await heroStat.reload()).playerStatId, originalGame.stat.id);
    assert.equal(heroStat.avgUltChargeSeconds, null);
    assert.deepEqual((await timeline.reload()).toJSON(), timelineBefore);
    assert.equal(await identity.PlayerExternalIdentity.count({ where: { playerId: player.id } }), 2);
    assert.deepEqual((await serializePlayersWithAliases(await player.reload())).aliases, ['Old Player']);
    assert.equal(await resolveCanonicalId('player', oldPlayer.id), player.id);
    assert.equal(player.identityOrigin, 'manual');
  });
  let detail = { id: 'sync-after-merge', updatedAt: '2026-09-29T00:00:00Z', eventName: season.name,
    teamA: { name: 'ZSG' }, teamB: { name: opponent.name }, scoreA: 1, scoreB: 0, matchDate: '2026-09-29',
    rounds: [{ mapName: map.name, winner: 'A', playersA: [{ name: 'Old Player', playerId: 'player-old', role: 'S', kad: '3/2/1' }], playersB: [] }] };
  const sync = createIncrementalMatchSyncService({ client: { fetchMatch: async () => detail } });
  await t.test('real inbox replay of old names and IDs cannot recreate merged rows', async () => {
    const beforeTeams = await m.teams.count(), beforePlayers = await m.players.count();
    await sync.syncMatch(detail.id); await sync.syncMatch(detail.id);
    assert.equal(await m.teams.count(), beforeTeams);
    assert.equal(await m.players.count(), beforePlayers);
    const synced = await m.matches.findOne({ where: { externalId: detail.id } });
    assert.equal(synced.team1Id, target.id);
    const game = await m.map_games.findOne({ where: { matchId: synced.id } });
    assert.equal((await m.player_stats.findOne({ where: { mapGameId: game.id } })).playerId, player.id);
    detail = { ...detail, updatedAt: '2026-09-29T00:01:00Z', rounds: [{ ...detail.rounds[0], playersB: [{ name: player.name, playerId: 'player-new', role: 'S' }] }] };
    await assert.rejects(sync.syncMatch(detail.id), /多个来源选手/);
    assert.equal(await m.player_stats.count({ where: { mapGameId: game.id } }), 1);
    assert.equal((await require('../models/ExternalMatchInbox').findByPk(detail.id)).status, 'pending');
  });
  await t.test('a new Matchweb ID follows an explicitly confirmed player alias', async () => {
    const beforePlayers = await m.players.count();
    detail = { ...detail, id: 'alias-new-external', updatedAt: '2026-09-29T00:02:00Z',
      rounds: [{ ...detail.rounds[0], playersA: [{ name: 'Old Player', playerId: 'player-third', role: 'S', kad: '4/1/2' }], playersB: [] }] };
    await sync.syncMatch(detail.id);
    await sync.syncMatch(detail.id);
    assert.equal(await m.players.count(), beforePlayers);
    assert.equal(await identity.PlayerExternalIdentity.count({ where: { playerId: player.id } }), 3);
    const match = await m.matches.findOne({ where: { externalId: detail.id } });
    const game = await m.map_games.findOne({ where: { matchId: match.id } });
    assert.equal((await m.player_stats.findOne({ where: { mapGameId: game.id } })).playerId, player.id);
  });
  await t.test('sync adds PF membership for a legacy support homonym and preserves the old roster on replay', async () => {
    const oldSeason = await Season.create({ name: 'Legacy SOAE Season' });
    const oldTeam = await makeTeam('SBAD Fixture'), newTeam = await makeTeam('PF Fixture');
    const support = await m.players.create({ name: 'SOAE', role: 'support', identityOrigin: 'legacy' });
    const damage = await m.players.create({ name: 'SOAE', role: 'damage', identityOrigin: 'legacy' });
    const oldMembership = await m.season_teams.create({ seasonId: oldSeason.id, teamId: oldTeam.id });
    const oldRoster = await m.season_team_players.create({ seasonTeamId: oldMembership.id, playerId: support.id });
    await m.season_team_players.create({ seasonTeamId: oldMembership.id, playerId: damage.id });
    const oldEvidence = await m.season_team_player_sources.create({ seasonTeamPlayerId: oldRoster.id, sourceType: 'manual', sourceKey: 'old-roster' });
    const source = { id: 'soae-role-regression', updatedAt: '2026-10-02T10:54:21Z', eventName: season.name,
      teamA: { name: opponent.name }, teamB: { name: newTeam.name }, scoreA: 1, scoreB: 0, matchDate: '2026-10-02',
      rounds: [{ mapName: map.name, winner: 'A', playersA: [], playersB: [{ name: 'SOAE', playerId: 'SOAE', role: 'S', kad: '6/8/9' }] }] };
    const replay = createIncrementalMatchSyncService({ client: { fetchMatch: async () => source } });
    const playerCount = await m.players.count();
    await replay.syncMatch(source.id);
    await replay.syncMatch(source.id);
    assert.equal(await m.players.count(), playerCount);
    assert.equal((await support.reload()).externalId, 'SOAE');
    assert.equal((await damage.reload()).externalId, null);
    assert.ok(await m.season_team_players.findByPk(oldRoster.id));
    assert.equal((await oldEvidence.reload()).active, true);
    assert.equal(await m.season_team_players.count({ where: { seasonTeamId: oldMembership.id } }), 2);
    const pf = await m.season_teams.findOne({ where: { seasonId: season.id, teamId: newTeam.id } });
    const roster = await m.season_team_players.findOne({ where: { seasonTeamId: pf.id, playerId: support.id } });
    assert.ok(roster);
    assert.equal(await m.season_team_players.count({ where: { seasonTeamId: pf.id } }), 1);
    assert.equal(await m.season_team_player_sources.count({ where: { seasonTeamPlayerId: roster.id, sourceType: 'match', sourceKey: source.id } }), 1);
    assert.equal((await identity.PlayerExternalIdentity.findOne({ where: { normalizedExternalId: 'soae' } })).playerId, support.id);
    const match = await m.matches.findOne({ where: { externalId: source.id } });
    const game = await m.map_games.findOne({ where: { matchId: match.id } });
    assert.equal((await m.player_stats.findOne({ where: { mapGameId: game.id } })).playerId, support.id);
    assert.equal(await m.player_stats.count({ where: { mapGameId: game.id } }), 1);
    assert.equal((await require('../models/ExternalMatchInbox').findByPk(source.id)).status, 'applied');
  });
  await t.test('role switch creates a separate identity and replay preserves both histories', async () => {
    const support = await makePlayer('ROCKCLIMB', 'ROCKCLIMB');
    await migrateEntityIdentities();
    detail = { ...detail, id: 'role-support', rounds: [{ ...detail.rounds[0],
      playersA: [{ name: 'ROCKCLIMB', playerId: 'ROCKCLIMB', role: 'S', kad: '1/2/3' }], playersB: [] }] };
    await sync.syncMatch(detail.id);
    const historic = await m.matches.findOne({ where: { externalId: detail.id } });
    const historicMap = await m.map_games.findOne({ where: { matchId: historic.id } });
    const historicStat = (await m.player_stats.findOne({ where: { mapGameId: historicMap.id } })).toJSON();
    detail = { ...detail, id: 'role-damage', rounds: [{ ...detail.rounds[0],
      playersA: [{ name: 'ROCKCLIMB', playerId: 'ROCKCLIMB', role: 'D', kad: '17/0/9' }] }] };
    await sync.syncMatch(detail.id);
    await sync.syncMatch(detail.id);
    const rows = await m.players.findAll({ where: { name: 'ROCKCLIMB' } });
    assert.equal(rows.length, 2);
    const damage = rows.find(row => row.role === 'damage');
    assert.notEqual(damage.id, support.id);
    assert.equal(damage.externalId, support.externalId);
    assert.equal(await identity.PlayerExternalIdentity.count({ where: { normalizedExternalId: 'rockclimb' } }), 2);
    assert.deepEqual((await m.player_stats.findByPk(historicStat.id)).toJSON(), historicStat);
    const current = await m.matches.findOne({ where: { externalId: detail.id } });
    const currentMap = await m.map_games.findOne({ where: { matchId: current.id } });
    const currentStat = await m.player_stats.findOne({ where: { mapGameId: currentMap.id } });
    assert.equal(currentStat.playerId, damage.id);
    assert.equal(currentStat.kills, 17);
    await migrateEntityIdentities();
    assert.equal(await m.players.count({ where: { name: 'ROCKCLIMB' } }), 2);
  });
  await t.test('concurrent confirmations serialize, retry idempotently, and flatten chained redirects', async () => {
    const final = await makeTeam('Final Team');
    const preview = await service.previewMerge('team', target.id, final.id);
    const results = await Promise.all([service.applyMerge('team', target.id, final.id, preview.fingerprint), service.applyMerge('team', target.id, final.id, preview.fingerprint)]);
    assert.equal(results.filter(r => r.alreadyApplied).length, 1);
    assert.equal(await resolveCanonicalId('team', source.id), final.id);
    assert.equal(await resolveCanonicalId('team', target.id), final.id);
    const controller = require('../controllers/TeamController');
    let response;
    await controller.update({ params: { id: final.id }, body: { name: final.name, region: 'KR', aliases: [] } },
      { status() { return this; }, json(value) { response = value; } });
    assert.ok(response.aliases.includes('ZSG'));
    assert.ok(response.aliases.includes('ZAN'));
  });
  await t.test('identity write lock actually blocks a competing transaction until commit', async () => {
    let unlock, entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const held = identityTransaction(async () => { entered(); await new Promise(resolve => { unlock = resolve; }); });
    await ready;
    let acquired = false;
    const waiting = identityTransaction(async () => { acquired = true; });
    await new Promise(resolve => setTimeout(resolve, 75));
    assert.equal(acquired, false);
    unlock(); await Promise.all([held, waiting]);
    assert.equal(acquired, true);
  });
  await t.test('public SQL catalogs and filters resolve aliases and old IDs', async () => {
    const { PublicDataRepository } = require('../services/publicData/repository');
    const repo = new PublicDataRepository(async (sql, values) => {
      for (const [original, replacement] of tableNames) sql = sql.replace(new RegExp(`\\b${original}\\b`, 'g'), replacement);
      const [rows] = await sequelize.query(sql, { replacements: values });
      return rows;
    });
    const found = await repo.catalog('players', { q: 'old player', limit: 10 });
    assert.equal(found.length, 1);
    assert.equal(found[0].id, player.id);
    assert.ok(found[0].aliases.includes('Old Player'));
    assert.equal((await repo.catalogItem('players', oldPlayer.id)).id, player.id);
    assert.ok((await repo.roster(season.id, source.id)).players.some(row => row.id === player.id));
    assert.ok((await repo.matches({ player_id: oldPlayer.id, team_id: source.id, limit: 10 }, null)).length);
  });
  await t.test('one-click Liquipedia team import uses page redirects and never writes a player roster', async t => {
    const wikiTeam = await makeTeam('SAU');
    await wikiTeam.update({ liquipediaUrl: 'https://liquipedia.net/overwatch/Team_Saudi_Arabia' });
    await makeTeam('Saudi Arabia'); // Identical display name is not identity evidence.
    const Config = require('../models/Config');
    await Config.create({ key: `visualize_season_${season.id}`, value: {
      liquipediaTournamentUrl: 'https://liquipedia.net/overwatch/Overwatch_World_Cup/2026'
    } });
    const client = require('../services/LiquipediaClient');
    t.mock.method(client, 'fetchParsedHtml', async () => ({
      html: fs.readFileSync(path.join(__dirname, 'fixtures/liquipedia-roster/world-cup.html'), 'utf8'), revisionId: 100
    }));
    t.mock.method(client, 'fetchCanonicalPages', async () => ({ 'Saudi Arabia': 'Team Saudi Arabia' }));
    const importService = require('../services/LiquipediaTeamImportService');
    const preview = await importService.preview(season.id);
    assert.equal(preview.summary.matchedTeams, 1);
    assert.equal(preview.teams.find(team => team.name === 'Saudi Arabia').teamId, wikiTeam.id);
    const beforePlayers = await m.season_team_players.count();
    const excluded = await importService.apply(season.id, preview.previewToken, [preview.teams[0].link]);
    assert.equal(excluded.createdTeams, 0);
    const first = await importService.apply(season.id, preview.previewToken);
    assert.equal(first.createdTeams, 1);
    assert.equal(first.addedTeamSources, 1);
    assert.ok(await m.season_teams.findOne({ where: { seasonId: season.id, teamId: wikiTeam.id } }));
    assert.equal(await m.season_team_sources.count({ where: { sourceType: 'liquipedia' } }), 1);
    assert.equal(await m.season_team_players.count(), beforePlayers);
    const repeated = await importService.apply(season.id, preview.previewToken);
    assert.equal(repeated.createdTeams, 0);
    assert.equal(repeated.addedTeamSources, 0);
    const stale = await importService.preview(season.id);
    await wikiTeam.update({ liquipediaUrl: null });
    await assert.rejects(importService.apply(season.id, stale.previewToken), { statusCode: 409 });
  });
  await t.test('browser merge workflow uses real HTTP and isolated tables on desktop and mobile', {
    skip: !process.env.ENTITY_MERGE_BROWSER_URL
  }, async () => {
    const base = process.env.ENTITY_MERGE_BROWSER_URL;
    assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
    const browserTeam = await makeTeam('Browser Old'), browserTarget = await makeTeam('Browser Keep');
    const browserPlayer = await makePlayer('Browser Player Old', 'browser-old');
    const browserPlayerTarget = await makePlayer('Browser Player Keep', 'browser-keep');
    await gameFor(browserTeam, browserPlayer);
    const app = require('../app'); // importing does not start schedulers or migrations
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const { launchBrowser } = await import('../../scripts/lib/browser.mjs');
    const browser = await launchBrowser();
    const output = path.join(__dirname, '../../.local/entity-merge-qa');
    fs.mkdirSync(output, { recursive: true });
    const errors = [];
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      await page.route(/\/(?:public-api|api)\//, async route => {
        const url = new URL(route.request().url());
        const pathname = url.pathname.replace(/^\/public-api(?:\/site\/v1)?\//, '/api/');
        const response = await route.fetch({ url: `http://127.0.0.1:${server.address().port}${pathname}${url.search}` });
        await route.fulfill({ response });
      });
      await page.goto(`${base}/data-manage/teams`, { waitUntil: 'domcontentloaded' });
      const card = page.locator('.team-card').filter({ has: page.locator('.entity-card-heading strong', { hasText: /^Browser Old$/ }) });
      await card.getByRole('button', { name: '合并', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '合并队伍', exact: true });
      await dialog.getByRole('combobox').click();
      await page.getByRole('option', { name: new RegExp(`^Opponent #${opponent.id}`) }).click();
      await dialog.getByRole('button', { name: '预览合并影响' }).click();
      await dialog.getByText(/比赛中存在双方待合并身份/).waitFor();
      assert.equal(await dialog.getByRole('button', { name: /^确认合入/ }).count(), 0);
      await page.screenshot({ path: path.join(output, 'blocked.png') });
      await dialog.getByRole('combobox').click();
      await page.getByRole('option', { name: /^Browser Keep #/ }).click();
      await dialog.getByRole('button', { name: '预览合并影响' }).click();
      await dialog.locator('.merge-direction').waitFor();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 960 });
        await page.screenshot({ path: path.join(output, `team-preview-${width}.png`), fullPage: true });
        assert.ok(await page.locator('.el-dialog.entity-merge-dialog').evaluate(node => node.getBoundingClientRect().width <= window.innerWidth - 16));
      }
      assert.equal(await dialog.getByRole('button', { name: '确认合入 Browser Keep' }).isEnabled(), false);
      await dialog.locator('.el-checkbox').click();
      assert.equal(await dialog.getByRole('checkbox').isChecked(), true);
      await dialog.getByRole('button', { name: '确认合入 Browser Keep' }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await m.teams.findByPk(browserTeam.id), null);
      assert.equal(await resolveCanonicalId('team', browserTeam.id), browserTarget.id);
      await page.goto(`${base}/data-manage/players`, { waitUntil: 'domcontentloaded' });
      const playerCard = page.locator('.player-card').filter({ has: page.locator('.entity-card-heading strong', { hasText: /^Browser Player Old$/ }) });
      await playerCard.getByRole('button', { name: '合并', exact: true }).click();
      const playerDialog = page.getByRole('dialog', { name: '合并选手', exact: true });
      await playerDialog.getByRole('combobox').click();
      await page.getByRole('option', { name: /^Browser Player Keep #/ }).click();
      await playerDialog.getByRole('button', { name: '预览合并影响' }).click();
      await playerDialog.locator('.merge-direction').waitFor();
      await page.screenshot({ path: path.join(output, 'player-preview-390.png'), fullPage: true });
      await playerDialog.locator('.el-checkbox').click();
      assert.equal(await playerDialog.getByRole('checkbox').isChecked(), true);
      await playerDialog.getByRole('button', { name: '确认合入 Browser Player Keep' }).click();
      await playerDialog.waitFor({ state: 'hidden' });
      assert.equal(await resolveCanonicalId('player', browserPlayer.id), browserPlayerTarget.id);
      await page.goto(`${base}/visualize/player-detail?playerId=${browserPlayer.id}`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Browser Player Keep', { exact: true }).first().waitFor();
      await page.goto(`${base}/visualize/team-detail?teamId=${browserTeam.id}&seasonId=${season.id}`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Browser Keep', { exact: true }).first().waitFor();
      assert.deepEqual(errors, []);
      fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ desktop: true, mobile: true, blockedConflicts: true, realMerges: 2, oldLinks: true, pageErrors: errors }, null, 2));
    } catch (error) {
      const page = browser.contexts()[0]?.pages()[0];
      if (page) {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
        fs.writeFileSync(path.join(output, 'failure.txt'), `${errors.join('\n')}\n${await page.locator('body').innerText()}`);
      }
      throw error;
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  });
});
