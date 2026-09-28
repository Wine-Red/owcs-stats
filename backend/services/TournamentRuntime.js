const { createTournamentService } = require('./LiquipediaTournamentService');
const { createTournamentScheduler } = require('./TournamentSyncScheduler');

let service, scheduler;
const getTournamentService = () => service ||= createTournamentService();
const startTournamentSync = () => {
  if (process.env.TOURNAMENT_SYNC_DISABLED === '1' || scheduler) return;
  const Season = require('../models/Season'), Config = require('../models/Config');
  const { Op } = require('sequelize');
  scheduler = createTournamentScheduler({ service: getTournamentService(), readCatalog: async () => {
    const [seasons, configs] = await Promise.all([
      Season.findAll({ raw: true }),
      Config.findAll({ where: { key: { [Op.like]: 'visualize_season_%' } }, raw: true })
    ]);
    return { seasons, configs };
  } });
  scheduler.start();
};
// Saving configuration only wakes an already-running worker; importing modules
// in a read-only API process or test never starts background work.
const wakeTournamentSync = () => scheduler?.wake();
const stopTournamentSync = async () => { if (scheduler) await scheduler.stop(); scheduler = null; };

module.exports = { getTournamentService, startTournamentSync, wakeTournamentSync, stopTournamentSync };
