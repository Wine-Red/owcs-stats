import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { groupTournamentStages, tournamentStageDisplayBlocks } from './tournamentStages.mjs';
import { attachStageResults } from './tournamentResults.mjs';
const require = createRequire(import.meta.url);
const { parseTournamentHtml } = require('../../backend/services/LiquipediaTournamentParser');
const { loadTournamentSnapshot } = require('../../backend/services/TournamentSnapshotLoader');
const { parseTournamentUrl } = require('../../backend/services/LiquipediaRosterParser');
const sources = require('../../backend/tests/fixtures/tournaments/sources.json');
const fixture = async name => ({ ...sources[name], html: await readFile(new URL(`../../backend/tests/fixtures/tournaments/${name}.html`, import.meta.url), 'utf8') });
const load = async name => loadTournamentSnapshot(parseTournamentUrl(sources[name].sourceUrl), {
  fetchPage: async ({ page }) => fixture(page.endsWith('/Regular Season') ? `${name}-regular` : name), fetchCanonicalPages: async () => ({})
});

test('real China and EMEA schedules become five correctly oriented chronological games per team', async () => {
  for (const name of ['china2', 'emea2']) {
    const data = await load(name), before = structuredClone(data);
    const stage = groupTournamentStages(data).find(s => s.id === (name === 'china2' ? 'round-robin' : 'regular-season'));
    const table = tournamentStageDisplayBlocks(stage, data)[0];
    assert.equal(table.resultsStatus.state, 'available');
    assert.equal(table.resultsStatus.matches, 15);
    for (const row of table.rows) {
      assert.equal(row.games.length, 5);
      assert.equal(new Set(row.games.map(game => game.opponent.url)).size, 5);
      assert.ok(row.games.every((game, index) => !index || game.timestamp > row.games[index - 1].timestamp));
      assert.equal(row.games.filter(game => game.ownScore > game.opponentScore).length, Number(row.matches.split('–')[0]));
      for (const game of row.games) {
        const opposingRow = table.rows.find(other => other.team.url === game.opponent.url);
        const reverse = opposingRow.games.find(other => other.key === game.key);
        assert.equal(reverse.score, `${game.opponentScore}:${game.ownScore}`);
      }
    }
    assert.deepEqual(data, before);
  }
});

test('World Cup keeps all four groups separate with exactly three opponents per row', async () => {
  const data = parseTournamentHtml(await fixture('world'));
  const stage = groupTournamentStages(data)[0];
  const tables = tournamentStageDisplayBlocks(stage, data);
  assert.equal(tables.length, 4);
  for (const table of tables) {
    assert.equal(table.resultsStatus.state, 'available');
    assert.equal(table.resultsStatus.matches, 6);
    assert.ok(table.rows.every(row => row.games.length === 3 && row.games.every(game => table.rows.some(other => other.team.url === game.opponent.url))));
  }
});

const team = name => ({ name, url: `https://liquipedia.net/overwatch/${name}` });
const teams = ['Alpha', 'Beta'].map(team);
const game = (overrides = {}) => ({ timestamp: Date.parse('2026-06-06T12:00:00Z'), opponents: teams.map((t, i) => ({ ...t, score: i ? 1 : 3 })), ...overrides });
const stage = (games = [game()], extras = {}) => ({ id: 'regular-season', roundRobinCycles: 1, blocks: [
  { id: 'table', type: 'standings', sourceTitle: 'Regular Season', rows: teams.map((t, i) => ({ team: { ...t }, matches: i ? '0–1' : '1–0', maps: i ? '1–3' : '3–1' })) },
  { id: 'list', type: 'matches', sourceTitle: 'Week 1', matches: games }
], ...extras });
const result = (value, snapshot) => attachStageResults(value, snapshot).blocks[0];

test('source pages and redirects can map rows without any locally registered teams or matches', () => {
  const input = stage(); input.blocks[1].matches[0].opponents[0].url = 'https://liquipedia.net/overwatch/Former_Alpha';
  assert.equal(result(input, { redirects: { 'Former Alpha': 'Alpha' } }).rows[0].games.length, 1);
  assert.equal(result(input).resultsStatus.state, 'unavailable');
  input.blocks[0].rows[0].team.teamId = 1;
  input.blocks[1].matches[0].opponents[0].teamId = 1;
  assert.equal(result(input).resultsStatus.state, 'available');
});

test('duplicate representations are merged, but conflicting scores disable the derived view', () => {
  const forward = game({ matchId: 7, matchSeasonId: 24 });
  const reverse = game({ opponents: [...forward.opponents].reverse(), matchId: 7, matchSeasonId: 24 });
  const table = result(stage([forward, reverse]));
  assert.equal(table.rows[0].games.length, 1);
  assert.equal(table.rows[1].games[0].matchId, 7);
  assert.equal(table.rows[1].games[0].matchSeasonId, 24);
  assert.equal(result(stage([forward, { ...reverse, matchSeasonId: 25 }])).resultsStatus.state, 'conflict');
  reverse.opponents[0] = { ...reverse.opponents[0], score: 0 };
  assert.equal(result(stage([forward, reverse])).resultsStatus.state, 'conflict');
  assert.equal(result(stage([game({ sourceConflict: true })])).resultsStatus.state, 'conflict');
});

test('same opponents at different times remain separate games in a double round robin', () => {
  const input = stage([game(), game({ timestamp: Date.parse('2026-06-07T12:00:00Z') })], { roundRobinCycles: 2 });
  input.blocks[0].rows.forEach((row, i) => { row.matches = i ? '0–2' : '2–0'; row.maps = i ? '2–6' : '6–2'; });
  assert.equal(result(input).resultsStatus.state, 'available');
  assert.equal(result(input).rows[0].games.length, 2);
  input.roundRobinCycles = 1;
  assert.equal(result(input).resultsStatus.state, 'conflict');
});

test('missing schedules, dates and TBD opponents never become zero scores or guessed games', () => {
  assert.equal(result(stage([])).resultsStatus.state, 'unavailable');
  assert.equal(result(stage([game({ timestamp: null })])).resultsStatus.state, 'unavailable');
  assert.equal(result(stage([game({ opponents: [{ name: 'TBD' }, { name: 'TBD' }] })])).resultsStatus.state, 'unavailable');
  const future = stage([game({ opponents: teams.map(t => ({ ...t, score: null })) })]);
  future.blocks[0].rows.forEach(row => { row.matches = '0–0'; row.maps = '0–0'; });
  assert.equal(result(future).rows[0].games[0].score, '—');
  const incomplete = stage(); incomplete.blocks[0].rows.forEach((row, i) => { row.matches = i ? '0–2' : '2–0'; row.maps = i ? '2–6' : '6–2'; });
  const table = result(incomplete);
  assert.equal(table.resultsStatus.state, 'partial');
  assert.deepEqual(table.gameLabels, ['已知 1']);
});

test('carried regular-season standings are checked against the baseline without rewriting totals', () => {
  const input = stage(undefined, { id: 'playoff-seeding', carryOver: 'regular-season', baselineTables: [{ rows: teams.map(t => ({ team: t, matches: '5–3', maps: '15–9' })) }] });
  input.blocks[0].rows.forEach((row, i) => { row.matches = i ? '5–4' : '6–3'; row.maps = i ? '16–12' : '18–10'; });
  const table = result(input);
  assert.equal(table.resultsStatus.state, 'available');
  assert.equal(table.rows[0].matches, '6–3');
  assert.equal(table.rows[0].games.length, 1);
});

test('unknown phases, ambiguous tables and groups do not map by team overlap alone', () => {
  assert.equal(result(stage(undefined, { id: 'other' })).resultsStatus.state, 'unavailable');
  const input = stage(); input.blocks.push({ ...input.blocks[0], id: 'another-table' });
  assert.equal(result(input).resultsStatus.state, 'unavailable');
  const group = stage(); group.blocks[0].sourceTitle = 'Group A'; group.blocks[1].sourceTitle = 'Group B';
  assert.equal(result(group).resultsStatus.state, 'unavailable');
});
