const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isHardDeleteEligibleOrphan,
  DEFAULT_ORPHAN_GRACE_DAYS,
  createTouchedMemberships,
  reconcileMemberships
} = require('../services/MembershipSourceService');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeamSource = require('../models/SeasonTeamSource');
const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource');

test('only sync-created identities past the grace period are hard-delete eligible', () => {
  const now = new Date('2026-08-29T12:00:00Z');
  const old = new Date('2026-08-20T12:00:00Z');
  const recent = new Date('2026-08-28T12:00:00Z');

  assert.equal(isHardDeleteEligibleOrphan({ identityOrigin: 'match', orphanedAt: old }, now, DEFAULT_ORPHAN_GRACE_DAYS), true);
  assert.equal(isHardDeleteEligibleOrphan({ identityOrigin: 'match', orphanedAt: recent }, now, DEFAULT_ORPHAN_GRACE_DAYS), false);
  assert.equal(isHardDeleteEligibleOrphan({ identityOrigin: 'manual', orphanedAt: old }, now, DEFAULT_ORPHAN_GRACE_DAYS), false);
  assert.equal(isHardDeleteEligibleOrphan({ identityOrigin: 'legacy', orphanedAt: old }, now, DEFAULT_ORPHAN_GRACE_DAYS), false);
});

test('reconciliation removes unsupported match relations but preserves configured bench relations', async t => {
  const originals = {
    seasonTeamFind: SeasonTeam.findByPk,
    seasonTeamDestroyCount: SeasonTeamPlayer.count,
    seasonTeamPlayerFind: SeasonTeamPlayer.findByPk,
    teamSourceCount: SeasonTeamSource.count,
    playerSourceCount: SeasonTeamPlayerSource.count
  };
  t.after(() => {
    SeasonTeam.findByPk = originals.seasonTeamFind;
    SeasonTeamPlayer.count = originals.seasonTeamDestroyCount;
    SeasonTeamPlayer.findByPk = originals.seasonTeamPlayerFind;
    SeasonTeamSource.count = originals.teamSourceCount;
    SeasonTeamPlayerSource.count = originals.playerSourceCount;
  });

  const destroyedPlayers = [];
  const destroyedTeams = [];
  const playerRelations = new Map([
    [11, { id: 11, seasonTeamId: 1, destroy: async () => destroyedPlayers.push(11) }],
    [12, { id: 12, seasonTeamId: 2, destroy: async () => destroyedPlayers.push(12) }]
  ]);
  SeasonTeamPlayer.findByPk = async id => playerRelations.get(Number(id));
  SeasonTeamPlayerSource.count = async ({ where }) => Number(where.seasonTeamPlayerId) === 12 ? 1 : 0;
  SeasonTeam.findByPk = async id => ({ id: Number(id), destroy: async () => destroyedTeams.push(Number(id)) });
  SeasonTeamSource.count = async () => 0;
  SeasonTeamPlayer.count = async ({ where }) => Number(where.seasonTeamId) === 2 ? 1 : 0;

  const touched = createTouchedMemberships();
  touched.seasonTeamPlayerIds.add(11);
  touched.seasonTeamPlayerIds.add(12);
  touched.seasonTeamIds.add(2);
  const result = await reconcileMemberships(touched);

  assert.deepEqual(destroyedPlayers, [11]);
  assert.deepEqual(destroyedTeams, [1]);
  assert.deepEqual(result.removedSeasonTeamPlayerIds, [11]);
  assert.deepEqual(result.retainedSeasonTeamPlayerIds, [12]);
  assert.deepEqual(result.retainedSeasonTeamIds, [2]);
});
