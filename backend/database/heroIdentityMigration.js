// Explicit, narrowly scoped maintenance; never run automatically at startup.
const MERGES = Object.freeze([
  { keepId: 34, duplicateId: 55, oldName: '弗雷娅', name: '弗蕾娅', externalId: 'freja', role: 'damage' },
  { keepId: 46, duplicateId: 54, oldName: '布里吉塔', name: '布丽吉塔', externalId: 'brigitte', role: 'support' }
]);
const REFERENCES = Object.freeze([
  ['player_stats', 'heroId'], ['player_hero_stats', 'heroId'],
  ['map_games', 'team1BanHeroId'], ['map_games', 'team2BanHeroId']
]);
const ids = MERGES.flatMap(merge => [merge.keepId, merge.duplicateId]);
const names = MERGES.flatMap(merge => [merge.oldName, merge.name]);
const slugs = MERGES.map(merge => merge.externalId);
const statTarget = row => MERGES.find(merge => [merge.keepId, merge.duplicateId].includes(row.heroId)
  || [merge.oldName, merge.name].includes(row.heroName) || row.heroExternalId === merge.externalId);

async function migrateHeroIdentities(connection, { expectedDatabase, dryRun = true, backup } = {}) {
  const [[identity]] = await connection.query('SELECT DATABASE() databaseName, VERSION() version');
  if (!expectedDatabase || identity.databaseName !== expectedDatabase) throw new Error('Database identity mismatch');
  if (!dryRun && typeof backup !== 'function') throw new Error('A durable backup is required before applying');
  await connection.query(dryRun ? 'START TRANSACTION READ ONLY' : 'START TRANSACTION');
  try {
    const lock = dryRun ? '' : ' FOR UPDATE';
    const [foreignKeys] = await connection.query(`SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'heroes'`);
    for (const key of foreignKeys) {
      if (!REFERENCES.some(([table, column]) => table === key.TABLE_NAME && column === key.COLUMN_NAME)) {
        throw new Error(`Unplanned hero reference: ${key.TABLE_NAME}.${key.COLUMN_NAME}`);
      }
    }
    const [heroes] = await connection.query(`SELECT * FROM heroes ORDER BY id${lock}`);
    for (const merge of MERGES) {
      const keep = heroes.find(hero => hero.id === merge.keepId);
      const duplicate = heroes.find(hero => hero.id === merge.duplicateId);
      if (!keep || ![merge.oldName, merge.name].includes(keep.name) || keep.role !== merge.role
        || (keep.externalId && keep.externalId !== merge.externalId)) {
        throw new Error(`Unexpected canonical hero ${merge.keepId}`);
      }
      if (duplicate && (duplicate.name !== merge.name || duplicate.externalId !== merge.externalId)) {
        throw new Error(`Unexpected duplicate hero ${merge.duplicateId}`);
      }
      if (heroes.some(hero => ![merge.keepId, merge.duplicateId].includes(hero.id)
        && ([merge.name, merge.oldName].includes(hero.name) || hero.externalId === merge.externalId))) {
        throw new Error(`Additional conflicting identity for ${merge.name}`);
      }
    }
    const [playerStats] = await connection.query(`SELECT * FROM player_stats WHERE heroId IN (?) ORDER BY id${lock}`, [ids]);
    const [heroStats] = await connection.query(`SELECT * FROM player_hero_stats
      WHERE heroId IN (?) OR heroName IN (?) OR heroExternalId IN (?) ORDER BY id${lock}`, [ids, names, slugs]);
    const [mapGames] = await connection.query(`SELECT * FROM map_games
      WHERE team1BanHeroId IN (?) OR team2BanHeroId IN (?) ORDER BY id${lock}`, [ids, ids]);
    // Never add or combine numerical statistics to resolve ambiguous duplicate rows.
    const seen = new Set();
    for (const row of heroStats) {
      const merge = statTarget(row);
      if ((row.heroId != null && ![merge.keepId, merge.duplicateId].includes(row.heroId))
        || ![merge.oldName, merge.name].includes(row.heroName)
        || (row.heroExternalId && row.heroExternalId !== merge.externalId)) {
        throw new Error(`Conflicting hero statistic ${row.id}`);
      }
      const key = `${row.playerStatId}:${merge.keepId}`;
      if (seen.has(key)) throw new Error(`Overlapping hero statistics for playerStatId ${row.playerStatId}`);
      seen.add(key);
    }
    const snapshot = { migration: 'canonical-hero-identities-20260914', capturedAt: new Date().toISOString(),
      identity, merges: MERGES, foreignKeys, heroes, playerStats, heroStats, mapGames };
    const changed = MERGES.some(merge => heroes.some(hero => hero.id === merge.duplicateId)
      || heroes.some(hero => hero.id === merge.keepId && (hero.name !== merge.name || hero.externalId !== merge.externalId)))
      || heroStats.some(row => { const merge = statTarget(row); return row.heroId !== merge.keepId
        || row.heroName !== merge.name || row.heroExternalId !== merge.externalId; });
    const result = { identity, changed, merges: MERGES, beforeHeroCount: heroes.length,
      references: { playerStats: playerStats.length, heroStats: heroStats.length, mapGames: mapGames.length } };
    if (dryRun || !changed) {
      await connection.rollback();
      return { ...result, dryRun, afterHeroCount: heroes.length };
    }
    await backup(snapshot);
    for (const merge of MERGES) {
      for (const [table, column] of REFERENCES) {
        await connection.query(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` = ?`,
          [merge.keepId, merge.duplicateId]);
      }
      for (const row of heroStats.filter(row => statTarget(row) === merge)) {
        await connection.query('UPDATE player_hero_stats SET heroId = ?, heroName = ?, heroExternalId = ? WHERE id = ?',
          [merge.keepId, merge.name, merge.externalId, row.id]);
      }
      await connection.query('DELETE FROM heroes WHERE id = ?', [merge.duplicateId]);
      await connection.query('UPDATE heroes SET name = ?, externalId = ? WHERE id = ?',
        [merge.name, merge.externalId, merge.keepId]);
    }
    const [afterHeroes] = await connection.query('SELECT * FROM heroes ORDER BY id');
    const expectedHeroes = heroes.filter(hero => !MERGES.some(merge => merge.duplicateId === hero.id)).map(hero => {
      const merge = MERGES.find(merge => merge.keepId === hero.id);
      return merge ? { ...hero, name: merge.name, externalId: merge.externalId } : hero;
    });
    const assertRows = (actual, expected) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Post-migration data verification failed');
    };
    assertRows(afterHeroes, expectedHeroes);
    const canonicalId = id => MERGES.find(merge => merge.duplicateId === id)?.keepId || id;
    for (const [table, before, expected] of [
      ['player_stats', playerStats, playerStats.map(row => ({ ...row, heroId: canonicalId(row.heroId) }))],
      ['player_hero_stats', heroStats, heroStats.map(row => { const merge = statTarget(row);
        return { ...row, heroId: merge.keepId, heroName: merge.name, heroExternalId: merge.externalId }; })],
      ['map_games', mapGames, mapGames.map(row => ({ ...row,
        team1BanHeroId: canonicalId(row.team1BanHeroId), team2BanHeroId: canonicalId(row.team2BanHeroId) }))]
    ]) {
      if (!before.length) continue;
      const [after] = await connection.query(`SELECT * FROM \`${table}\` WHERE id IN (?) ORDER BY id`, [before.map(row => row.id)]);
      assertRows(after, expected);
    }
    await connection.commit();
    return { ...result, dryRun: false, afterHeroCount: afterHeroes.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

module.exports = { MERGES, migrateHeroIdentities };
