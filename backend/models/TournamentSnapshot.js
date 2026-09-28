const database = require('../config/database');
const { defineTournamentSnapshot } = require('../database/tournamentSnapshotSchema');
module.exports = defineTournamentSnapshot(database);
