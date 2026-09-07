const sequelize = require('../config/database');
const Season = require('../models/Season');
const Team = require('../models/Team');
const Player = require('../models/Player');
const { validateTeamIdentity } = require('./TeamAliasService');
const membership = require('./MembershipSourceService');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const cleanName = (value, label) => {
  if (typeof value !== 'string') throw fail(`请填写${label}`);
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 255) throw fail(`${label}不能为空且不能超过 255 个字符`);
  return name;
};
const parseChoice = (choice, kind) => {
  if (!choice || typeof choice !== 'object' || Array.isArray(choice)) throw fail(`请选择或新建${kind}`);
  if (Object.prototype.hasOwnProperty.call(choice, 'id')) {
    if (choice.new !== undefined || !Number.isSafeInteger(choice.id) || choice.id <= 0) throw fail(`${kind} ID 无效`);
    return { id: choice.id };
  }
  const name = cleanName(choice.new?.name, `${kind}名称`);
  if (kind === '队伍') return { new: { name, region: cleanName(choice.new?.region, '队伍地区') } };
  const role = choice.new?.role;
  if (!['tank', 'damage', 'support'].includes(role)) throw fail('请选择新选手的位置');
  return { new: { name, role } };
};

const save = async (seasonId, body) => {
  if (!Number.isSafeInteger(seasonId) || seasonId <= 0) throw fail('赛季 ID 无效');
  const teamChoice = parseChoice(body?.team, '队伍');
  const inputPlayers = body?.players ?? [];
  if (!Array.isArray(inputPlayers) || inputPlayers.length > 100) throw fail('一次最多补充 100 位选手');
  const choices = inputPlayers.map(choice => parseChoice(choice, '选手'));
  const keys = choices.map(choice => choice.id ? `id:${choice.id}` : `new:${choice.new.name.toLowerCase()}`);
  if (new Set(keys).size !== keys.length) throw fail('本次选择中有重复的选手，请检查后保存');

  return sequelize.transaction(async transaction => {
    const season = await Season.findByPk(seasonId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!season) throw fail('赛季不存在', 404);
    // Lock the catalog when creating identities, so this workflow cannot create
    // the same normalized player name concurrently in different seasons.
    const catalog = choices.length ? await Player.findAll({
      attributes: ['id', 'name', 'role'], transaction, raw: true,
      lock: choices.some(choice => choice.new) ? transaction.LOCK.UPDATE : transaction.LOCK.SHARE
    }) : [];
    for (const choice of choices) {
      if (choice.id && !catalog.some(player => Number(player.id) === choice.id)) throw fail(`选手 #${choice.id} 已不存在，请刷新后重新选择`, 409);
      if (choice.new) {
        const existing = catalog.filter(player => player.name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase() === choice.new.name.toLowerCase());
        if (existing.length) throw fail(`选手 ${choice.new.name} 已存在（${existing.map(player => `#${player.id}`).join('、')}），请从已有选手中选择`, 409);
      }
    }
    let team;
    if (teamChoice.id) {
      team = await Team.findByPk(teamChoice.id, { transaction, lock: transaction.LOCK.SHARE });
      if (!team) throw fail('所选队伍已不存在，请刷新后重新选择', 409);
    } else {
      let identity;
      try { identity = await validateTeamIdentity({ name: teamChoice.new.name, aliases: [], transaction }); }
      catch (error) { throw fail(error.message, 409); }
      team = await Team.create({ name: identity.name, region: teamChoice.new.region }, { transaction });
    }
    const ensured = await membership.addManualSeasonTeam({ seasonId, teamId: team.id, transaction });
    const savedPlayers = [];
    let createdPlayers = 0;
    let createdPlayerRelations = 0;
    for (const choice of choices) {
      const player = choice.new
        ? await Player.create({ ...choice.new, identityOrigin: 'manual' }, { transaction })
        : catalog.find(player => Number(player.id) === choice.id);
      createdPlayers += Number(!!choice.new);
      const relation = await membership.addManualSeasonTeamPlayer({ seasonTeam: ensured.seasonTeam, playerId: player.id, transaction });
      createdPlayerRelations += Number(relation.relationCreated);
      savedPlayers.push({ id: Number(player.id), name: player.name, role: player.role });
    }
    return {
      seasonId, seasonTeamId: Number(ensured.seasonTeam.id),
      team: { id: Number(team.id), name: team.name, region: team.region }, players: savedPlayers,
      createdTeam: !!teamChoice.new, createdPlayers, createdTeamRelations: Number(ensured.relationCreated), createdPlayerRelations,
      message: `已保存 ${team.name} 的手工配置：新增 ${Number(ensured.relationCreated)} 条队伍关联、${createdPlayerRelations} 条选手关联${createdPlayers ? `，新建 ${createdPlayers} 位选手` : ''}。已有关系及其他来源均保留。`
    };
  });
};

module.exports = { save };
