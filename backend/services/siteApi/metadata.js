const { createHash } = require('node:crypto');
const { Transaction } = require('sequelize');
const { isPublicConfigKey } = require('./contract');

const sourceNames = ['Season', 'Team', 'TeamAlias', 'Player', 'Map', 'Hero', 'Match', 'MapGame',
    'PlayerStat', 'PlayerHeroStat', 'SeasonTeam', 'SeasonTeamPlayer', 'SeasonStage',
    'SeasonTeamSource', 'SeasonTeamPlayerSource', 'MapGameTimeline'];
// Several source tables have no updatedAt. Hash their actual records so edits
// and deletes cannot silently leave an old page marked current. Large timeline
// bodies already have an authoritative digest and are never loaded here.
const readMetadata = async ({ database, models, readSchedule } = {}) => {
  const sequelize = database || require('../../config/database');
  const resolveModel = name => models?.[name] || require(`../../models/${name}`);
  const Config = resolveModel('Config');
  const signature = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, async transaction => {
    const result = [];
    // Sequential queries keep this small probe from occupying the entire DB pool.
    for (const name of sourceNames) {
      const model = resolveModel(name);
      const attributes = name === 'MapGameTimeline' ? ['id', 'mapGameId', 'digest', 'revision'] : Object.keys(model.rawAttributes);
      result.push([name, await model.findAll({ attributes, order: [['id', 'ASC']], raw: true, transaction })]);
    }
    const configs = await Config.findAll({ attributes: ['key', 'value'], order: [['key', 'ASC']], raw: true, transaction });
    result.push(['config', configs.filter(row => isPublicConfigKey(row.key))]);
    return result;
  });
  const schedule = await (readSchedule || require('../UpcomingMatchesService').getUpcomingSchedule)();
  signature.push(['schedule', schedule.data, Boolean(schedule.stale)]);
  return {
    apiVersion: 1,
    revision: createHash('sha256').update(JSON.stringify(signature)).digest('hex'),
    refreshAfterSeconds: 60,
    schedule: { observedAt: schedule.observedAt, stale: Boolean(schedule.stale) },
    capabilities: { readOnly: true, voting: false }
  };
};
module.exports = { readMetadata, sourceNames };
