// Retirement migration only. No view definitions or creation paths remain.
const LEGACY_AGENT_VIEWS = Object.freeze([
  'ai_v_seasons', 'ai_v_season_teams', 'ai_v_team_roster', 'ai_v_matches',
  'ai_v_map_games', 'ai_v_player_map_stats', 'ai_v_player_hero_stats',
  'ai_v_match_coverage', 'ai_v_season_data_coverage', 'ai_v_data_freshness'
]);
const targets = LEGACY_AGENT_VIEWS.map(name => `'${name}'`).join(', ');
const quoteIdentifier = value => `\`${String(value).replace(/`/g, '``')}\``;

const inspectLegacyAgentViews = async (database, expectedDatabase) => {
  const [identities] = await database.query('SELECT VERSION() AS version, DATABASE() AS database_name, CURRENT_USER() AS db_user');
  const identity = identities[0];
  if (!identity?.database_name || (expectedDatabase && identity.database_name !== expectedDatabase)) {
    throw new Error('Database identity does not match the requested retirement target.');
  }
  const [objects] = await database.query(`SELECT TABLE_NAME AS name, TABLE_TYPE AS kind FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${targets}) ORDER BY TABLE_NAME`);
  if (objects.some(row => !LEGACY_AGENT_VIEWS.includes(row.name))) throw new Error('Inventory contains an unexpected view identity; nothing was removed.');
  if (objects.some(row => row.kind !== 'VIEW')) throw new Error('An obsolete view name belongs to a base table; nothing was removed.');
  if (objects.length) {
    const [dependents] = await database.query(`SELECT VIEW_SCHEMA AS view_schema, VIEW_NAME AS view_name FROM information_schema.VIEW_TABLE_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${targets})
      AND (VIEW_SCHEMA <> DATABASE() OR VIEW_NAME NOT IN (${targets}))`);
    if (dependents.length) throw new Error('Other views depend on the obsolete views; nothing was removed.');
  }
  return { identity, views: objects.map(row => row.name) };
};

const retireLegacyAgentViews = async (database, { expectedDatabase, dryRun = false, beforeDrop } = {}) => {
  const inventory = await inspectLegacyAgentViews(database, expectedDatabase);
  if (dryRun || !inventory.views.length) return { ...inventory, dropped: [] };
  if (beforeDrop) await beforeDrop(inventory);
  const names = inventory.views.map(name => `${quoteIdentifier(inventory.identity.database_name)}.${quoteIdentifier(name)}`);
  // DROP VIEW cannot remove base tables, and no wildcard is expanded into DDL.
  await database.query(`DROP VIEW IF EXISTS ${names.join(', ')}`);
  const after = await inspectLegacyAgentViews(database, inventory.identity.database_name);
  if (after.views.length) throw new Error('Obsolete views remain after retirement.');
  return { identity: inventory.identity, views: [], dropped: inventory.views };
};

module.exports = { LEGACY_AGENT_VIEWS, quoteIdentifier, inspectLegacyAgentViews, retireLegacyAgentViews };
