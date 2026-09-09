const { Op } = require('sequelize');
const SeasonTeam = require('../models/SeasonTeam');
const SeasonTeamPlayer = require('../models/SeasonTeamPlayer');
const SeasonTeamSource = require('../models/SeasonTeamSource');
const SeasonTeamPlayerSource = require('../models/SeasonTeamPlayerSource');
const Season = require('../models/Season');
const Team = require('../models/Team');
const Player = require('../models/Player');

const plain = row => row?.get ? row.get({ plain: true }) : row?.toJSON ? row.toJSON() : row;

// Export only public source types, not source URLs, tokens, or internal evidence.
const attachSources = async (rows, model, relationKey, transaction) => {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  if (!list.length) return Array.isArray(rows) ? [] : null;
  const sources = await model.findAll({
    where: { [relationKey]: { [Op.in]: list.map(row => Number(row.id)) }, active: true },
    attributes: [relationKey, 'sourceType'], group: [relationKey, 'sourceType'], transaction, raw: true
  });
  const grouped = new Map();
  for (const source of sources) {
    const id = Number(source[relationKey]);
    if (!grouped.has(id)) grouped.set(id, new Set());
    grouped.get(id).add(source.sourceType);
  }
  const result = list.map(row => ({ ...plain(row),
    sources: [...(grouped.get(Number(row.id)) || [])].sort().map(sourceType => ({ sourceType }))
  }));
  return Array.isArray(rows) ? result : result[0];
};

const getSeasonTeams = async ({ id, transaction } = {}) => {
  const options = { transaction, include: [
    { model: Season, attributes: ['id', 'name'], as: 'Season' },
    { model: Team, attributes: ['id', 'name'], as: 'Team' },
    { model: SeasonTeamPlayer, attributes: ['id'], as: 'players' }
  ] };
  const rows = id === undefined ? await SeasonTeam.findAll(options) : await SeasonTeam.findByPk(id, options);
  return attachSources(rows, SeasonTeamSource, 'seasonTeamId', transaction);
};

const getSeasonTeamPlayers = async ({ id, seasonTeamId, transaction } = {}) => {
  const options = { transaction, include: [
    { model: SeasonTeam, attributes: ['id', 'seasonId', 'teamId'] },
    { model: Player, attributes: ['id', 'name', 'role'] }
  ] };
  if (seasonTeamId !== undefined) options.where = { seasonTeamId };
  const rows = id === undefined ? await SeasonTeamPlayer.findAll(options) : await SeasonTeamPlayer.findByPk(id, options);
  return attachSources(rows, SeasonTeamPlayerSource, 'seasonTeamPlayerId', transaction);
};

module.exports = { getSeasonTeams, getSeasonTeamPlayers };
