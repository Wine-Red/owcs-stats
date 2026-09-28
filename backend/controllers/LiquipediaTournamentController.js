const Season = require('../models/Season');
const Config = require('../models/Config');
const Team = require('../models/Team');
const TeamAlias = require('../models/TeamAlias');
const SeasonTeam = require('../models/SeasonTeam');
const Match = require('../models/Match');
const { Op } = require('sequelize');
const { getTournamentService } = require('../services/TournamentRuntime');
const { resolveTournamentSource, resolveTournamentSeasonIds } = require('../services/TournamentSourceResolver');

const get = async (req, res) => {
  const seasonId = Number(req.params.seasonId);
  if (!Number.isSafeInteger(seasonId) || seasonId < 1) return res.status(400).json({ error: '赛季 ID 无效' });
  try {
    const [season, config] = await Promise.all([Season.findByPk(seasonId), Config.findByPk(`visualize_season_${seasonId}`)]);
    if (!season) return res.status(404).json({ error: '赛季不存在' });
    const value = typeof config?.value === 'string' ? JSON.parse(config.value) : config?.value;
    const sourceUrl = resolveTournamentSource(season, value);
    if (!sourceUrl) return res.json({ configured: false });
    const [links, seasons, configs] = await Promise.all([
      SeasonTeam.findAll({ where: { seasonId }, raw: true }),
      Season.findAll({ attributes: ['id', 'name', 'externalEventName'], raw: true }),
      Config.findAll({ where: { key: { [Op.like]: 'visualize_season_%' } }, raw: true })
    ]);
    const matchSeasonIds = [...new Set([seasonId, ...resolveTournamentSeasonIds(sourceUrl, seasons, configs)])];
    const ids = new Set(links.map(row => Number(row.teamId)));
    const [teams, aliases, matches] = await Promise.all([
      Team.findAll({ raw: true }),
      TeamAlias.findAll({ raw: true }),
      Match.findAll({ where: { seasonId: { [Op.in]: matchSeasonIds } }, raw: true })
    ]);
    return res.json({ ...await getTournamentService().get(sourceUrl, {
      allTeams: teams, teams: teams.filter(team => ids.has(Number(team.id))), aliases, matches, seasonId, matchSeasonIds
    }), seasonId });
  } catch (error) {
    console.error('Tournament read failed:', error.message);
    return res.status(502).json({ error: '赛制来源暂时不可用，请稍后重试' });
  }
};
module.exports = { get };
