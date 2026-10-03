const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { parseTournamentHtml, translateRule, translateLabel } = require('../services/LiquipediaTournamentParser');
const { bindTournament } = require('../services/TournamentMatchMatcher');
const { createTournamentService } = require('../services/LiquipediaTournamentService');
const sources = require('./fixtures/tournaments/sources.json');
const fixture = async name => ({ ...sources[name], html: await fs.readFile(path.join(__dirname, 'fixtures/tournaments', `${name}.html`), 'utf8') });
const parsed = async name => parseTournamentHtml(await fixture(name));

test('real China source: Swiss rounds, selected latest standings, six-game double elimination and child discovery', async () => {
  const data = await parsed('china2');
  assert.equal(data.blocks[0].rows.length, 8);
  assert.equal(data.blocks[0].rows[0].rounds.length, 4);
  assert.equal(data.blocks[0].rows[0].rounds[2].score, '—');
  const standings = data.blocks.find(b => b.type === 'standings');
  assert.equal(standings.rows.length, 6);
  assert.equal(standings.rows[0].team.name, 'Weibo Gaming');
  assert.equal(standings.rows[0].matches, '5–0'); // Not the embedded week-1 3:0 table.
  const bracket = data.blocks.at(-1);
  assert.equal(bracket.matches.length, 6);
  assert.equal(bracket.edges.length, 5);
  assert.equal(bracket.matches.find(m => m.round === '总决赛').bestOf, 'BO7');
  assert.deepEqual(bracket.matches.find(m => m.round === '总决赛').opponents.map(t => t.score), [4, 1]);
  assert.equal(new Set(bracket.matches.map(m => `${m.depth}:${m.y}`)).size, 6);
  assert.ok(data.children[0].endsWith('/Regular Season'));
  assert.deepEqual(data.warnings, []);
  assert.ok(data.rules.some(r => r.text === '双败淘汰制'));
  assert.ok(data.rules.every(r => !r.original.includes('Participants')));
});

test('World Cup: four groups, 24 group matches, eight playoff matches including an unconnected third-place game', async () => {
  const data = await parsed('world');
  assert.equal(data.blocks.filter(b => b.type === 'standings').length, 4);
  assert.equal(data.blocks.filter(b => b.type === 'matches').flatMap(b => b.matches).length, 24);
  const bracket = data.blocks.find(b => b.type === 'bracket');
  assert.equal(bracket.matches.length, 8);
  assert.equal(bracket.edges.length, 6);
  const third = bracket.matches.find(m => m.round === '季军赛');
  assert.ok(third);
  assert.ok(!bracket.edges.some(e => e.from === third.id || e.to === third.id));
  assert.equal(data.blocks[0].rows[0].team.shortName, 'USA');
  assert.deepEqual(data.children, []); // Never follow links to previous World Cups.
  assert.deepEqual(data.warnings, []);
  assert.ok(data.rules.every(r => r.original.length < 500));
});

test('Korea six-team playoffs use neutral opening rounds and each qualifier branch uses its own headers', async () => {
  const data = await parsed('korea2');
  const [qualifier, playoffs] = data.blocks;
  assert.equal(qualifier.title, '最后机会资格赛');
  assert.deepEqual(qualifier.matches.map(m => m.round), ['胜者组决赛', '败者组半决赛', '败者组决赛']);
  assert.deepEqual(qualifier.matches.at(-1).opponents.map(t => t.score), [3, 1]);
  assert.equal(playoffs.matches.length, 6);
  assert.equal(new Set(playoffs.matches.flatMap(m => m.opponents.map(t => t.url))).size, 6);
  assert.deepEqual(playoffs.matches.map(m => m.round), ['第 1 轮', '半决赛', '第 1 轮', '半决赛', '总决赛', '季军赛']);
  assert.equal(playoffs.matches[0].sourceRound, 'Quarterfinals');
  assert.ok(data.blocks.flatMap(b => b.matches).every(m => !/八强|Qualified/.test(m.round)));
});

test('round labels remain in their source columns when a bye shortens one branch', async () => {
  const source = await fixture('korea2');
  const $ = require('cheerio').load(source.html);
  $('.brkts-bracket-wrapper').first().remove();
  const semifinal = $('.brkts-bracket > .brkts-round-body > .brkts-round-lower > .brkts-round-body').first();
  semifinal.children('.brkts-round-lower').remove();
  const bracket = parseTournamentHtml({ ...source, html: $.html() }).blocks[0];
  const match = bracket.matches.find(m => m.opponents[0].name === 'Crazy Raccoon' && m.opponents[1].name === 'ZANSIDE GAMING');
  assert.equal(match.round, '半决赛');
  assert.equal(match.sourceRound, 'Semifinals');
  assert.equal(bracket.matches.length, 5);
});

test('Decider labels consistently describe seeds without implying elimination or qualification', async () => {
  assert.equal(translateLabel('Decider'), '种子决定战');
  assert.equal(translateLabel('Seeding Decider Matches'), '种子决定战');
  assert.equal(translateLabel('1st-2nd Decider'), '第 1–2 种子决定战');
  assert.equal(translateLabel('3rd-4th Decider'), '第 3–4 种子决定战');
  const data = await parsed('china2');
  assert.deepEqual(data.blocks.filter(b => b.type === 'bracket' && b.matches.length === 1).map(b => b.matches[0].round),
    ['第 1–2 种子决定战', '第 3–4 种子决定战', '第 5–6 种子决定战']);
});

test('seeding deciders parse repeated unknown-team labels as one TBD', async () => {
  const source = await fixture('china2');
  const $ = require('cheerio').load(source.html);
  const bracket = $('.brkts-bracket-wrapper').first();
  bracket.find('.match-info-header-opponent').each((_, node) => {
    $(node).html('<span class="name"><span>TBD</span><span>TBD</span><span>TBD</span></span>');
  });
  bracket.find('.brkts-opponent-score-inner').text('-');
  const match = parseTournamentHtml({ ...source, html: $.html() }).blocks
    .find(block => block.type === 'bracket' && block.matches.length === 1).matches[0];
  assert.equal(match.round, '第 1–2 种子决定战');
  assert.deepEqual(match.opponents.map(team => [team.name, team.shortName, team.url, team.score]),
    [['TBD', 'TBD', null, null], ['TBD', 'TBD', null, null]]);
});

test('saved repeated TBD placeholders are normalized without inventing team bindings or changing the snapshot', () => {
  const input = snapshot([event({ opponents: [
    { name: 'TBDTBDTBD', shortName: 'TBDTBDTBD', score: null },
    { name: 'TBD TBD TBD', shortName: 'TBD TBD', score: null }
  ] })]);
  const before = structuredClone(input);
  const result = bindTournament(input, { teams: [teamA, teamB], matches: [] });
  const opponents = result.blocks[0].matches[0].opponents;
  assert.deepEqual(opponents.map(team => [team.name, team.shortName]), [['TBD', 'TBD'], ['TBD', 'TBD']]);
  assert.ok(opponents.every(team => !team.teamId));
  assert.equal(result.blocks[0].matches[0].matchId, undefined);
  assert.deepEqual(input, before);
});

test('future bracket keeps unknown opponents, scores and times unknown, and ignores redlinked child pages', async () => {
  const data = await parsed('na3');
  assert.equal(data.blocks[0].matches.length, 6);
  assert.ok(data.blocks[0].matches.every(m => m.timestamp === null && m.opponents.every(t => t.score === null && t.name === '待定')));
  assert.deepEqual(data.children, []);
  assert.throws(() => parseTournamentHtml({ html: '<p>API error</p>', page: 'Test' }));
  assert.throws(() => parseTournamentHtml({ html: '<p>No structures</p>'.repeat(10), page: 'Test' }));
  assert.equal(translateRule('Unrecognized special rule'), 'Unrecognized special rule');
});

test('EMEA uses final standings and discovers its three weekly match lists without hand-authored round configuration', async () => {
  const root = await parsed('emea2'), child = await parsed('emea2-regular');
  assert.equal(root.blocks[0].rows.length, 6);
  assert.equal(root.blocks[0].rows[0].team.name, 'Virtus.pro');
  assert.equal(root.blocks[0].rows[0].matches, '5–0');
  assert.equal(root.blocks[1].matches.length, 6);
  assert.deepEqual(child.blocks.filter(b => b.type === 'matches').map(b => b.matches.length), [5, 5, 5]);
});

const teamA = { id: 1, name: 'AAA', liquipediaUrl: 'https://liquipedia.net/overwatch/Alpha', aliases: ['Old A'] };
const teamB = { id: 2, name: 'BBB', liquipediaUrl: 'https://liquipedia.net/overwatch/Beta' };
const event = overrides => ({ id: 'event', timestamp: Date.parse('2026-06-10T17:00:00Z'), opponents: [{ name: 'Alpha', shortName: 'AAA', url: teamA.liquipediaUrl, score: 3 }, { name: 'Beta', shortName: 'BBB', url: teamB.liquipediaUrl, score: 1 }], ...overrides });
const snapshot = events => ({ blocks: [{ type: 'matches', matches: events }] });
const local = overrides => ({ id: 99, team1Id: 2, team2Id: 1, matchDate: '2026-06-11', team1Score: 1, team2Score: 3, ...overrides });
const bind = (events, matches, extra = {}) => bindTournament({ ...snapshot(events), ...extra }, { teams: [teamA, teamB], matches }).blocks[0].matches;

test('unique source URLs and verified redirects take priority over conflicting names', () => {
  assert.equal(bind([event()], [local()])[0].matchId, 99);
  const redirected = event(); redirected.opponents[0].url = 'https://liquipedia.net/overwatch/Former_Alpha';
  assert.equal(bind([redirected], [local()], { redirects: { 'Former Alpha': 'Alpha' } })[0].matchId, 99);
  assert.equal(bind([redirected], [local()])[0].matchId, undefined);
  redirected.opponents[0] = { name: 'Old A', score: 3 };
  assert.equal(bind([redirected], [local()])[0].matchId, 99);
  const conflicting = event(); conflicting.opponents[0].name = 'BBB'; conflicting.opponents[0].shortName = 'BBB';
  const matched = bind([conflicting], [local()])[0];
  assert.equal(matched.matchId, 99);
  assert.equal(matched.opponents[0].teamId, 1);
  assert.equal(matched.opponents[0].localName, 'AAA');
  conflicting.opponents[0].url = 'https://liquipedia.net/overwatch/Former_Alpha';
  assert.equal(bind([conflicting], [local()], { redirects: { 'Former Alpha': 'Alpha' } })[0].matchId, 99);
});

test('duplicate canonical page bindings cannot be disambiguated by names', () => {
  for (const url of [teamA.liquipediaUrl, 'https://liquipedia.net/overwatch/Former_Alpha']) {
    const result = bindTournament({ ...snapshot([event()]), redirects: { 'Former Alpha': 'Alpha' } }, {
      teams: [teamA, teamB, { id: 3, name: 'Different name', liquipediaUrl: url }], matches: [local()]
    }).blocks[0].matches[0];
    assert.equal(result.opponents[0].teamId, undefined);
    assert.equal(result.matchId, undefined);
  }
});

test('all confirmed pages bind to one local identity, while secondary-page conflicts stay unlinked', () => {
  const renamed = { ...teamA, name: 'Renamed team', liquipediaUrls: [teamA.liquipediaUrl, 'https://liquipedia.net/overwatch/Alpha_Global'] };
  const input = event(); input.opponents[0] = { name: 'BBB', url: renamed.liquipediaUrls[1], score: 3 };
  const check = (teams, extra = {}) => bindTournament({ ...snapshot([input]), ...extra }, { teams, matches: [local()] }).blocks[0].matches[0];
  assert.equal(check([renamed, teamB]).matchId, 99);
  assert.equal(check([renamed, teamB]).opponents[0].localName, 'Renamed team');
  input.opponents[0].url = 'https://liquipedia.net/overwatch/Former_Global';
  assert.equal(check([renamed, teamB], { redirects: { 'Former Global': 'Alpha Global' } }).matchId, 99);
  input.opponents[0].url = renamed.liquipediaUrls[1];
  assert.equal(check([renamed, teamB, { id: 3, name: 'Other', liquipediaUrls: [input.opponents[0].url] }]).matchId, undefined);
  assert.equal(check([{ ...renamed, liquipediaUrls: [teamA.liquipediaUrl] }, teamB]).matchId, undefined);
  assert.equal(check([teamB]).matchId, undefined);
});

test('global page identity does not require season membership or local matches', () => {
  const renamed = { ...teamA, name: 'Renamed team', logo: '/a.webp', liquipediaUrls: [teamA.liquipediaUrl, 'https://liquipedia.net/overwatch/Alpha_Global'] };
  const input = event(); input.opponents[0].url = renamed.liquipediaUrls[1];
  const data = snapshot([input]);
  data.blocks.push({ type: 'standings', rows: [{ team: { name: 'Alpha', url: teamA.liquipediaUrl } }] });
  const result = bindTournament(data, { teams: [], allTeams: [renamed, teamB], seasonId: 13 });
  assert.deepEqual(result.blocks[0].matches[0].opponents.map(t => t.teamId), [1, 2]);
  assert.equal(result.blocks[0].matches[0].opponents[0].logo, '/a.webp');
  assert.equal(result.blocks[1].rows[0].team.localName, 'Renamed team');
  assert.equal(result.blocks[0].matches[0].matchId, undefined);
  assert.equal(data.blocks[1].rows[0].team.teamId, undefined);
});

test('global identity keeps URL collisions ambiguous even when only one team belongs to the season', () => {
  const result = bindTournament(snapshot([event()]), { teams: [teamA, teamB],
    allTeams: [teamA, teamB, { id: 3, name: 'Different team', liquipediaUrls: [teamA.liquipediaUrl] }], matches: [local()] });
  assert.equal(result.blocks[0].matches[0].opponents[0].teamId, undefined);
  assert.equal(result.blocks[0].matches[0].matchId, undefined);
});

test('unregistered teams link only to the selected season and name fallback needs membership or match evidence', () => {
  const locals = [local({ seasonId: 13 }), local({ id: 100, seasonId: 24 })];
  const check = (input, overrides = {}) => bindTournament(snapshot([input]), {
    teams: [], allTeams: [teamA, teamB], matches: locals, seasonId: 13, ...overrides
  }).blocks[0].matches[0];
  assert.equal(check(event()).matchId, 99);
  assert.equal(check(event(), { matches: [locals[1]] }).matchId, undefined);
  const namesOnly = event(); namesOnly.opponents = [{ name: 'Old A', score: 3 }, { name: 'BBB', score: 1 }];
  assert.equal(check(namesOnly).matchId, 99);
  assert.ok(check(namesOnly, { matches: [locals[1]] }).opponents.every(t => !t.teamId));
  const member = check(namesOnly, { teams: [teamA], matches: [] });
  assert.equal(member.opponents[0].teamId, 1);
  assert.equal(member.opponents[1].teamId, undefined);
  const alias = event(); alias.opponents[0] = { name: 'Shared source alias', score: 3 };
  assert.equal(check(alias, { aliases: [{ teamId: 1, alias: 'Shared source alias' }] }).matchId, 99);
  assert.equal(check(alias, { aliases: [{ teamId: 1, alias: 'Shared source alias' }], matches: [] }).opponents[0].teamId, undefined);
});

test('exact name and alias fallback requires a unique identity without conflicting pages', () => {
  const cases = [
    { source: { name: 'AAA' }, expected: 1 },
    { source: { name: 'Source name', shortName: 'AAA' }, expected: 1 },
    { source: { name: 'Old A' }, expected: 1 },
    { source: { name: 'Object alias' }, teams: [{ ...teamA, aliases: [{ alias: 'Object alias' }] }, teamB], expected: 1 },
    { source: { name: 'Stored alias' }, aliases: [{ teamId: 1, alias: 'Stored alias' }], expected: 1 },
    { source: { name: 'AAA', url: teamA.liquipediaUrl }, teams: [{ ...teamA, liquipediaUrl: null }, teamB], expected: 1 },
    { source: { name: 'AAA', url: 'https://liquipedia.net/overwatch/Unrelated' } },
    { source: { name: 'AAA' }, teams: [teamA, teamB, { id: 3, name: 'Another team', aliases: ['AAA'] }] },
    { source: { name: 'Alph' } },
    // Alias rows alone cannot introduce a team absent from the supplied catalog.
    { source: { name: 'AAA', url: teamA.liquipediaUrl }, teams: [teamB], aliases: [{ teamId: 1, alias: 'AAA' }] }
  ];
  for (const { source, teams = [teamA, teamB], aliases = [], expected } of cases) {
    const input = event(); input.opponents[0] = { ...source, score: 3 };
    const result = bindTournament(snapshot([input]), { teams, aliases, matches: [local()] }).blocks[0].matches[0];
    assert.equal(result.opponents[0].teamId, expected, JSON.stringify(source));
    assert.equal(result.matchId, expected ? 99 : undefined, JSON.stringify(source));
    assert.equal(input.opponents[0].teamId, undefined);
  }
});

test('ambiguous rematches, conflicting scores, unknown timestamps and out-of-window games stay unlinked', () => {
  assert.equal(bind([event()], [local(), local({ id: 100 })])[0].matchId, undefined);
  assert.equal(bind([event()], [local({ team2Score: 0 })])[0].matchId, undefined);
  assert.equal(bind([event({ timestamp: null })], [local()])[0].matchId, undefined);
  assert.equal(bind([event()], [local({ matchDate: '2026-06-08' })])[0].matchId, undefined);
  assert.equal(bind([event()], [local({ matchDate: '2026-06-10' })])[0].matchId, 99); // Shanghai day +/- 1
  assert.ok(bind([event(), event({ id: 'same-source-another-block' })], [local()]).every(m => m.matchId === 99));
  assert.ok(bind([event(), event({ timestamp: Date.parse('2026-06-11T17:00:00Z') })], [local()]).every(m => !m.matchId));
});

test('nearby rematches link only when the full one-to-one assignment forces the identity', () => {
  const source = [event({ timestamp: Date.parse('2026-07-03T16:50:00Z') }), event({ timestamp: Date.parse('2026-07-05T15:40:00Z') })];
  const matches = [local({ id: 877, seasonId: 20, matchDate: '2026-07-03' }), local({ id: 908, seasonId: 20, matchDate: '2026-07-05' })];
  for (const ordered of [matches, [...matches].reverse()]) {
    const result = bind(source, ordered);
    assert.deepEqual(result.map(m => m.matchId), [877, 908]);
    assert.deepEqual(result.map(m => m.matchSeasonId), [20, 20]);
    assert.deepEqual(bind([...source].reverse(), ordered).map(m => m.matchId), [908, 877]);
  }
  // Both sources fit both local dates: chronological proximity alone cannot choose.
  assert.ok(bind(source, matches.map(m => ({ ...m, matchDate: '2026-07-04' }))).every(m => !m.matchId));
  // More source events than local records cannot be fixed by consuming one first.
  assert.ok(bind(source, [matches[1]]).every(m => !m.matchId));
  const extra = event({ timestamp: Date.parse('2026-08-01T12:00:00Z') });
  assert.equal(bind([...source, extra], [matches[1], local({ id: 1001, matchDate: '2026-08-01' })])[2].matchId, 1001);
});

test('same-event season scope supplies actual link seasons while unrelated games and stale links stay excluded', () => {
  const input = event({ matchId: 1234, matchSeasonId: 999 });
  const check = (matches, matchSeasonIds) => bindTournament(snapshot([input]), {
    teams: [teamA, teamB], matches, seasonId: 24, matchSeasonIds
  }).blocks[0].matches[0];
  const playoff = local({ id: 101, seasonId: 25 }), unrelated = local({ id: 102, seasonId: 26 });
  const linked = check([playoff, unrelated], [24, 25]);
  assert.equal(linked.matchId, 101);
  assert.equal(linked.matchSeasonId, 25);
  assert.equal(check([playoff, unrelated]).matchId, undefined);
  assert.equal(check([playoff, unrelated]).matchSeasonId, undefined);
  assert.equal(check([unrelated], [24, 25]).matchId, undefined);
  assert.equal(check([playoff, local({ seasonId: 24 })], [24, 25]).matchId, undefined);
});

test('real China Swiss cells link both team perspectives to the 12 verified round matches', async () => {
  const root = await parsed('china2'), child = await parsed('china2-regular');
  const blocks = [...root.blocks, ...child.blocks];
  const sourceMatches = blocks.flatMap(b => b.matches || []);
  const teamsByUrl = new Map();
  for (const match of sourceMatches) for (const team of match.opponents) if (!teamsByUrl.has(team.url)) {
    teamsByUrl.set(team.url, { id: teamsByUrl.size + 1, name: team.name, liquipediaUrl: team.url });
  }
  const uniqueMatches = new Map();
  for (const match of sourceMatches) {
    const ids = match.opponents.map(t => teamsByUrl.get(t.url).id);
    const key = `${[...ids].sort().join('-')}:${match.timestamp}`;
    if (!uniqueMatches.has(key)) uniqueMatches.set(key, {
      id: uniqueMatches.size + 100, team1Id: ids[0], team2Id: ids[1],
      team1Score: match.opponents[0].score, team2Score: match.opponents[1].score,
      matchDate: new Date(match.timestamp).toISOString().slice(0, 10)
    });
  }
  const result = bindTournament({ blocks }, { teams: [...teamsByUrl.values()], matches: [...uniqueMatches.values()] });
  const swiss = result.blocks.find(b => b.type === 'swiss');
  const rounds = swiss.rows.flatMap(r => r.rounds);
  assert.equal(rounds.filter(r => r.matchId).length, 24);
  assert.equal(new Set(rounds.map(r => r.matchId).filter(Boolean)).size, 12);
  assert.ok(rounds.filter(r => r.score === '—').every(r => !r.matchId));
  for (const row of swiss.rows) for (const [index, round] of row.rounds.entries()) if (round.matchId) {
    const other = swiss.rows.find(r => r.team.teamId === round.opponent.teamId);
    assert.equal(other.rounds[index].matchId, round.matchId);
    const label = swiss.roundLabels[index] || `第 ${index + 1} 轮`;
    const list = result.blocks.find(b => b.type === 'matches' && b.title === label);
    assert.ok(list.matches.some(m => m.matchId === round.matchId));
  }
});

test('Swiss links require the same source round, matching scores and a unique verified event', () => {
  const sourceUrl = 'https://liquipedia.net/overwatch/Test';
  const swiss = { type: 'swiss', sourceUrl, roundLabels: ['第 1 轮'], rows: [
    { team: { name: 'AAA' }, rounds: [{ score: '3:1', opponent: { name: 'BBB' } }] },
    { team: { name: 'BBB' }, rounds: [{ score: '1:3', opponent: { name: 'AAA' } }] }
  ] };
  const list = { type: 'matches', title: '第 1 轮', sourceUrl: `${sourceUrl}/Regular_Season`, matches: [event()] };
  const check = (lists = [list], locals = [local()], table = swiss) => bindTournament(
    { blocks: [table, ...lists] }, { teams: [teamA, teamB], matches: locals }
  ).blocks[0].rows.map(r => r.rounds[0].matchId);
  assert.deepEqual(check(), [99, 99]);
  assert.deepEqual(check([list, structuredClone(list)]), [99, 99]);
  assert.deepEqual(check([{ ...list, title: '第 2 轮' }]), [undefined, undefined]);
  assert.deepEqual(check([{ ...list, sourceUrl: `${sourceUrl}_Other/Regular_Season` }]), [undefined, undefined]);
  assert.deepEqual(check([list], []), [undefined, undefined]);
  const conflicting = structuredClone(swiss); conflicting.rows[0].rounds[0].score = '3:0';
  assert.equal(check([list], [local()], conflicting)[0], undefined);
  const unknown = structuredClone(swiss); unknown.rows[0].rounds[0].score = '—';
  assert.equal(check([list], [local()], unknown)[0], undefined);
  const rematch = event({ timestamp: Date.parse('2026-06-17T17:00:00Z') });
  const locals = [local(), local({ id: 100, matchDate: '2026-06-18' })];
  assert.deepEqual(check([list, { ...list, title: '第 2 轮', matches: [rematch] }], locals), [99, 99]);
  assert.deepEqual(check([{ ...list, matches: [event(), rematch] }], locals), [undefined, undefined]);
});

test('Swiss cells inherit dates and canonical opponents for unplayed previews without inventing match IDs', () => {
  const sourceUrl = 'https://liquipedia.net/overwatch/Test';
  const future = event({ timestamp: Date.parse('2030-06-11T10:00:00Z'), opponents: [
    { name: 'AAA', url: teamA.liquipediaUrl, score: null }, { name: 'BBB', url: teamB.liquipediaUrl, score: null }
  ] });
  const table = { type: 'swiss', stageId: 'swiss', sourceUrl, roundLabels: ['第 1 轮'], rows: [
    { team: { name: 'AAA' }, rounds: [{ score: '—', opponent: { name: 'BBB' } }] },
    { team: { name: 'BBB' }, rounds: [{ score: '—', opponent: { name: 'AAA' } }] }
  ] };
  const list = { type: 'matches', stageId: 'swiss', title: '第 1 轮', sourceUrl, matches: [future] };
  const bindRows = matches => bindTournament({ blocks: [table, { ...list, matches }] }, { teams: [teamA, teamB] }).blocks[0].rows;
  const rounds = bindRows([future]).map(row => row.rounds[0]);
  assert.ok(rounds.every(round => round.timestamp === future.timestamp && !round.matchId));
  assert.deepEqual(rounds[0].opponents, rounds[1].opponents);
  const rematch = { ...future, timestamp: future.timestamp + 86400000 };
  assert.ok(bindRows([future, rematch]).every(row => !row.rounds[0].timestamp));
});

test('source loader merges transclusions and rejects a broken child without a partial result', async () => {
  const { loadTournamentSnapshot } = require('../services/TournamentSnapshotLoader');
  const { parseTournamentUrl } = require('../services/LiquipediaRosterParser');
  const root = await fixture('china2'), child = await fixture('china2-regular');
  const source = parseTournamentUrl(sources.china2.sourceUrl);
  let calls = 0, fail = false;
  const options = { now: () => 100000, fetchCanonicalPages: async () => ({}), fetchPage: async ({ page }) => {
    calls++;
    if (page.endsWith('/Regular Season')) { if (fail) throw new Error('Child unavailable'); return child; }
    return root;
  } };
  const first = await loadTournamentSnapshot(source, options);
  assert.equal(calls, 2);
  assert.equal(first.blocks.filter(b => b.type === 'swiss').length, 1);
  assert.equal(first.blocks.filter(b => b.type === 'standings').length, 1);
  assert.equal(first.blocks.flatMap(b => b.matches || []).length, 36);
  fail = true;
  await assert.rejects(loadTournamentSnapshot(source, options), /Child unavailable/);
});

test('public reads only read the snapshot store and rebind the latest local catalog', async () => {
  let row = null, reads = 0;
  const service = createTournamentService({
    store: { read: async () => { reads++; return row; } },
    fetchPage: () => { throw new Error('A public GET must never fetch upstream'); },
    legacyCacheDir: 'A public GET must never read legacy files',
    now: () => 100000
  });
  const url = 'https://liquipedia.net/overwatch/Test';
  assert.equal((await service.get(url, {})).loading, true);
  assert.equal((await service.get(url, {})).loading, true);
  const payload = { version: 2, page: 'Test', observedAt: 50000, ...snapshot([event()]) };
  row = { payload, lastError: 'upstream offline', nextSyncAt: new Date(90000) };
  const unbound = await service.get(url, {});
  assert.equal(unbound.syncError, true);
  assert.equal(unbound.blocks[0].matches[0].matchId, undefined);
  const bound = await service.get(url, { teams: [teamA, teamB], matches: [local()] });
  assert.equal(bound.blocks[0].matches[0].matchId, 99);
  assert.equal(payload.blocks[0].matches[0].matchId, undefined);
  assert.deepEqual(await service.readSaved('Test'), payload);
  assert.deepEqual(await service.get('', {}), { configured: false });
  await assert.rejects(service.get('https://example.com/overwatch/Test', {}));
  assert.equal(reads, 5);
});
