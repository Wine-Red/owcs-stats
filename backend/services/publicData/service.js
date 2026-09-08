const { PublicDataRepository } = require('./repository');
const { createReadDatabase } = require('./database');
const { createCursorCodec } = require('./cursor');
const { notFound, unavailable } = require('./errors');
const dto = require('./contract');

const createPublicDataService = ({ database = createReadDatabase(), cursors = createCursorCodec(),
  getSchedule = () => require('../UpcomingMatchesService').getUpcomingSchedule() } = {}) => {
  const read = work => database.snapshot(select => work(new PublicDataRepository(select)));
  const page = (rows, query, scope, previous) => {
    const data = rows.slice(0, query.limit), last = data.at(-1);
    return { data, pagination: { next_cursor: rows.length > query.limit ? cursors.encode(
      scope === 'matches' ? { id: last.id, date: last.date } : { id: last.id }, scope, query, previous) : null } };
  };
  return {
    database,
    catalog: (kind, { params, query }) => {
      const scope = params.competition_id ? `competitions/${params.competition_id}/teams` : kind;
      const cursor = cursors.decode(query.cursor, scope, query);
      return read(async repo => page(await repo.catalog(kind, query, cursor?.after, params.competition_id), query, scope, cursor));
    },
    item: (kind, id) => read(async repo => ({ data: await repo.catalogItem(kind, id) })),
    stages: competitionId => read(async repo => {
      await repo.requireCatalog('competitions', competitionId);
      return { data: (await repo.stages(competitionId)).map(dto.stage) };
    }),
    roster: (competitionId, teamId) => read(async repo => ({ data: await repo.roster(competitionId, teamId) })),
    matches: query => {
      const cursor = cursors.decode(query.cursor, 'matches', query);
      return read(async repo => page(await repo.matches(query, cursor?.after), query, 'matches', cursor));
    },
    match: matchId => read(async repo => ({ data: await repo.match(matchId) })),
    gameResource: (kind, { params, query }) => read(async repo => {
      const parent = await repo.match(params.match_id);
      const bundles = await repo.gameData([parent], params.game_id);
      if (kind === 'data') return { data: { match: parent, games: bundles, result_consistency: dto.resultConsistency(parent, bundles.map(b => b.game)) } };
      if (kind === 'games') return { data: bundles.map(b => b.game) };
      if (kind === 'game') return { data: bundles[0].game };
      const bundle = bundles[0];
      if (query.team_id && ![bundle.game.team1.team.id, bundle.game.team2.team.id].includes(query.team_id)) throw notFound();
      if (query.player_id) await repo.requireCatalog('players', query.player_id);
      return { data: bundle.player_stats.filter(p => (!query.team_id || p.team.id === query.team_id) && (!query.player_id || p.player.id === query.player_id)) };
    }),
    coverage: (competitionId, query) => read(async repo => {
      await repo.requireCatalog('competitions', competitionId);
      const matches = await repo.matches({ competition_id: competitionId, ...query }, null, false);
      return { data: dto.coverage(competitionId, query.stage_id, matches, await repo.gameData(matches)) };
    }),
    schedule: async () => {
      let result;
      // Do not hold a database connection while waiting for the external source.
      try { result = await getSchedule(); } catch (error) { throw unavailable(`Schedule read failed: ${error.message}`); }
      return read(async repo => {
        const catalogs = await repo.scheduleCatalogs();
        return dto.schedule(result, catalogs.competitions, catalogs.teams);
      });
    }
  };
};

module.exports = { createPublicDataService };
