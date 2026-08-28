const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTeamIdentity,
  cleanAliasList,
  buildTeamIdentityMap
} = require('../services/TeamAliasService');

test('team identities normalize case, width and repeated whitespace', () => {
  assert.equal(normalizeTeamIdentity('  ＤＦ  '), 'df');
  assert.equal(normalizeTeamIdentity('Team   Falcons'), 'team falcons');
  assert.deepEqual(cleanAliasList([' DF ', 'ｄｆ', 'Dallas Fuel'], 'DAL'), ['DF', 'Dallas Fuel']);
});

test('team alias lookup resolves to the canonical team model', () => {
  const dal = { id: 33, name: 'DAL' };
  const jdg = { id: 23, name: 'JDG' };
  const identities = buildTeamIdentityMap([dal, jdg], [
    { teamId: 33, alias: 'DF' },
    { teamId: 23, alias: 'JD' }
  ]);
  assert.equal(identities.get(normalizeTeamIdentity('df')), dal);
  assert.equal(identities.get(normalizeTeamIdentity('ＤＦ')), dal);
  assert.equal(identities.get(normalizeTeamIdentity('DAL')), dal);
  assert.equal(identities.get(normalizeTeamIdentity('jd')), jdg);
});

test('team identity map rejects aliases owned by another canonical team', () => {
  assert.throws(
    () => buildTeamIdentityMap(
      [{ id: 1, name: 'WBG' }, { id: 2, name: 'WEI' }],
      [{ teamId: 1, alias: 'WEI' }]
    ),
    /队伍身份冲突/
  );
});
