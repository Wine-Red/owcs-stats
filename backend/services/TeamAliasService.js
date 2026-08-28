const Team = require('../models/Team');
const TeamAlias = require('../models/TeamAlias');

const MAX_ALIAS_LENGTH = 191;

const normalizeTeamIdentity = value => String(value || '')
  .normalize('NFKC')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('en-US');

const cleanAliasList = (aliases, mainName = '') => {
  if (!Array.isArray(aliases)) throw new Error('队伍别名必须是数组');
  const mainKey = normalizeTeamIdentity(mainName);
  const unique = new Map();
  for (const value of aliases) {
    const alias = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!alias) continue;
    if (alias.length > MAX_ALIAS_LENGTH) throw new Error(`队伍别名不能超过 ${MAX_ALIAS_LENGTH} 个字符`);
    const key = normalizeTeamIdentity(alias);
    if (key === mainKey) continue;
    if (!unique.has(key)) unique.set(key, alias);
  }
  return [...unique.values()];
};

const buildTeamIdentityMap = (teams, aliases = []) => {
  const teamById = new Map(teams.map(team => [Number(team.id), team]));
  const identityMap = new Map();
  const register = (value, team, source) => {
    const key = normalizeTeamIdentity(value);
    if (!key) return;
    const current = identityMap.get(key);
    if (current && Number(current.id) !== Number(team.id)) {
      throw new Error(`队伍身份冲突：${source}“${value}”同时指向“${current.name}”和“${team.name}”`);
    }
    identityMap.set(key, team);
  };

  teams.forEach(team => register(team.name, team, '主名'));
  aliases.forEach(alias => {
    const team = teamById.get(Number(alias.teamId));
    if (!team) throw new Error(`队伍别名“${alias.alias}”关联了不存在的队伍 ${alias.teamId}`);
    register(alias.alias, team, '别名');
  });
  return identityMap;
};

const loadTeamIdentities = async transaction => {
  const [teams, aliases] = await Promise.all([
    Team.findAll({ transaction }),
    TeamAlias.findAll({ transaction })
  ]);
  return { teams, aliases, identityMap: buildTeamIdentityMap(teams, aliases) };
};

const validateTeamIdentity = async ({ teamId = null, name, aliases, transaction }) => {
  const cleanName = String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!cleanName) throw new Error('队伍主名不能为空');
  const cleanAliases = cleanAliasList(aliases, cleanName);
  const { teams, aliases: storedAliases } = await loadTeamIdentities(transaction);
  const currentId = teamId === null ? null : Number(teamId);
  const candidates = [
    { value: cleanName, type: '主名' },
    ...cleanAliases.map(value => ({ value, type: '别名' }))
  ];

  for (const candidate of candidates) {
    const key = normalizeTeamIdentity(candidate.value);
    const collidingTeam = teams.find(team => (
      Number(team.id) !== currentId && normalizeTeamIdentity(team.name) === key
    ));
    if (collidingTeam) {
      throw new Error(`${candidate.type}“${candidate.value}”已被队伍“${collidingTeam.name}”使用`);
    }
    const collidingAlias = storedAliases.find(alias => (
      Number(alias.teamId) !== currentId && alias.normalizedAlias === key
    ));
    if (collidingAlias) {
      const owner = teams.find(team => Number(team.id) === Number(collidingAlias.teamId));
      throw new Error(`${candidate.type}“${candidate.value}”已是队伍“${owner?.name || collidingAlias.teamId}”的别名`);
    }
  }

  return { name: cleanName, aliases: cleanAliases };
};

const replaceTeamAliases = async (teamId, aliases, transaction) => {
  await TeamAlias.destroy({ where: { teamId }, transaction });
  if (!aliases.length) return;
  await TeamAlias.bulkCreate(aliases.map(alias => ({
    teamId,
    alias,
    normalizedAlias: normalizeTeamIdentity(alias)
  })), { transaction });
};

const serializeTeamsWithAliases = async (teams, transaction) => {
  const list = Array.isArray(teams) ? teams : [teams];
  if (!list.length) return Array.isArray(teams) ? [] : null;
  const teamIds = list.map(team => Number(team.id));
  const aliases = await TeamAlias.findAll({
    where: { teamId: teamIds },
    order: [['alias', 'ASC']],
    transaction
  });
  const aliasesByTeam = new Map();
  aliases.forEach(alias => {
    const current = aliasesByTeam.get(Number(alias.teamId)) || [];
    current.push(alias.alias);
    aliasesByTeam.set(Number(alias.teamId), current);
  });
  const serialized = list.map(team => ({
    ...(typeof team.toJSON === 'function' ? team.toJSON() : team),
    aliases: aliasesByTeam.get(Number(team.id)) || []
  }));
  return Array.isArray(teams) ? serialized : serialized[0];
};

module.exports = {
  MAX_ALIAS_LENGTH,
  normalizeTeamIdentity,
  cleanAliasList,
  buildTeamIdentityMap,
  loadTeamIdentities,
  validateTeamIdentity,
  replaceTeamAliases,
  serializeTeamsWithAliases
};
