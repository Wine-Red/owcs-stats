import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getLiquipediaTournamentPageKey,
  isLiquipediaTournamentMatch,
  isValidLiquipediaTournamentUrl,
  normalizeLiquipediaTournamentUrl
} from './liquipediaTournament.mjs';

const TOURNAMENT_URL = 'https://liquipedia.net/overwatch/Overwatch_Champions_Series/2026/China/Stage_2';

test('normalizes a Liquipedia Overwatch tournament URL', () => {
  assert.equal(
    normalizeLiquipediaTournamentUrl(`${TOURNAMENT_URL}/?utm_source=test#Regional_Playoffs`),
    TOURNAMENT_URL
  );
  assert.equal(
    getLiquipediaTournamentPageKey('https://liquipedia.net/overwatch/index.php?title=Overwatch_Champions_Series%2F2026%2FChina%2FStage_2'),
    'overwatch_champions_series/2026/china/stage_2'
  );
  assert.equal(isValidLiquipediaTournamentUrl(TOURNAMENT_URL), true);
  assert.equal(isValidLiquipediaTournamentUrl(`/overwatch/Overwatch_Champions_Series/2026/China/Stage_2`), false);
});

test('matches the configured page while ignoring anchors and query parameters', () => {
  assert.equal(isLiquipediaTournamentMatch(`${TOURNAMENT_URL}#Regional_Playoffs`, TOURNAMENT_URL), true);
  assert.equal(isLiquipediaTournamentMatch(`${TOURNAMENT_URL}?utm_source=ticker`, TOURNAMENT_URL), true);
});

test('does not use names or unsafe and similarly prefixed URLs as a fallback', () => {
  assert.equal(isLiquipediaTournamentMatch('', TOURNAMENT_URL), false);
  assert.equal(isLiquipediaTournamentMatch('OWCS China Stage 2', TOURNAMENT_URL), false);
  assert.equal(isLiquipediaTournamentMatch(`${TOURNAMENT_URL}0`, TOURNAMENT_URL), false);
  assert.equal(isLiquipediaTournamentMatch(`${TOURNAMENT_URL}/Open_Qualifier`, TOURNAMENT_URL), false);
  assert.equal(isLiquipediaTournamentMatch('https://example.com/overwatch/Overwatch_Champions_Series/2026/China/Stage_2', TOURNAMENT_URL), false);
  assert.equal(normalizeLiquipediaTournamentUrl('https://liquipedia.net/dota2/The_International'), '');
});
