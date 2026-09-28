import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './lib/browser.mjs';

const base = process.env.TOURNAMENT_PREVIEW_URL || 'http://127.0.0.1:8083';
const output = '.local/tournament-qa';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const report = [], errors = [];
let releaseLoadingRequest;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  const screenshot = async name => {
    await page.waitForFunction(() => !document.querySelector('[class*="-enter-active"], [class*="-leave-active"]'));
    await page.screenshot({ path: `${output}/${name}`, animations: 'disabled' });
  };
  console.log('Reading the real tournament snapshot');
  const raw = await (await page.request.get(`${base}/api/seasons/28/tournament`)).json();
  const knownGames = raw.blocks.filter(block => block.stageId === 'regular-season').flatMap(block => block.matches || [])
    .filter(match => match.timestamp > Date.now() && match.opponents.every(team => team.teamId && team.score == null));
  assert.ok(knownGames.length >= 28);
  // Hold only this browser's response to inspect the real HTTP loading state.
  const loadingGate = new Promise(resolve => { releaseLoadingRequest = resolve; });
  await page.route('**/seasons/28/tournament', async route => {
    await loadingGate;
    return route.fulfill({ json: raw });
  });
  console.log('Checking the loading state');
  await page.goto(`${base}/visualize?seasonId=28`, { waitUntil: 'domcontentloaded' });
  const loadingState = page.locator('.tournament-empty.is-loading');
  await loadingState.waitFor({ timeout: 60000 });
  assert.equal(await loadingState.getAttribute('aria-busy'), 'true');
  assert.equal(await loadingState.innerText(), '正在加载赛事进程\n稍后即可查看赛制与对阵');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.ok(await loadingState.locator('.tournament-spinner').evaluate(element => getComputedStyle(element).animationName.startsWith('tournament-spin')));
  await screenshot('tournament-loading-mobile.png');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await loadingState.locator('.tournament-spinner').evaluate(element => getComputedStyle(element).animationName), 'none');
  releaseLoadingRequest();
  console.log('Checking rounded preview cards, symmetric logos and the more link');
  await page.locator('.vis-tabs [role="tab"]').first().waitFor();
  assert.deepEqual(await page.locator('.vis-tabs [role="tab"]').allTextContents().then(labels => labels.map(label => label.trim())),
    ['赛事进程', '比赛列表', '赛事数据']);
  assert.equal(await page.locator('.vis-tabs [aria-selected="true"]').innerText(), '赛事进程');
  const board = page.locator('.tournament-board');
  const stageTabs = page.locator('#tournament-stage-tabs-host .tournament-tabs');
  await stageTabs.waitFor();
  await page.unroute('**/seasons/28/tournament');
  assert.equal(await loadingState.count(), 0);
  report.push({ check: 'Loading shows a centered spinner and short explanation, respects reduced motion, and clears on success', passed: true });
  assert.equal(await page.locator('.tab-content .tournament-tabs').count(), 0);
  const topTabsBox = await page.locator('.vis-tabs-container').boundingBox();
  const stageTabsBox = await stageTabs.boundingBox();
  assert.ok(topTabsBox && stageTabsBox && Math.abs(topTabsBox.y + topTabsBox.height - stageTabsBox.y) <= 1);
  await board.locator('a.swiss-result').first().waitFor();
  const links = await board.locator('a.swiss-result[href*="upcoming-match"]').evaluateAll(links => links.map(link => link.href));
  assert.equal(links.length, knownGames.length * 2);
  assert.equal(new Set(links).size, knownGames.length);
  assert.equal(await board.locator('.result-score-date').count(), knownGames.length * 2);
  assert.equal(await board.locator('.swiss-result.has-preview').count(), 0);
  assert.ok(await board.locator('.result-score-date').evaluateAll(dates => dates.every(date => /^\d{2}\.\d{2}$/.test(date.textContent.trim()))));
  const previewLinks = board.locator('.preview-lead');
  assert.equal(await previewLinks.count(), 3);
  assert.equal(await board.locator('.preview-more').count(), 1);
  assert.equal(await previewLinks.locator('.preview-team-logo').count(), 6);
  await page.waitForFunction(() => [...document.querySelectorAll('.preview-team-logo')].every(logo => logo.complete && logo.naturalWidth > 0));
  assert.ok((await previewLinks.first().innerText()).includes('10.02 16:00'));
  assert.equal(await board.locator('.preview-toggle, .preview-heading').count(), 0);
  const nearestLinks = await previewLinks.evaluateAll(links => links.map(link => link.href));
  assert.equal(new Set(nearestLinks).size, 3);
  const previewTimes = nearestLinks.map(href => Number(new URL(href).searchParams.get('time')));
  assert.deepEqual(previewTimes, knownGames.map(match => match.timestamp).sort((a, b) => a - b).slice(0, 3));
  for (const width of [320, 375, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await board.locator('.result-score-date').evaluateAll(dates => dates.every(date => date.scrollWidth <= date.clientWidth + 1)));
    assert.ok(await previewLinks.evaluateAll(links => links.every(link => {
      const rect = link.getBoundingClientRect();
      return rect.height >= 44 && rect.height <= 45 && link.scrollWidth <= link.clientWidth + 1;
    })));
    assert.ok(await previewLinks.evaluateAll(links => links.every(link => Math.abs(link.getBoundingClientRect().top - links[0].getBoundingClientRect().top) <= 1)));
    assert.ok(await board.locator('.preview-lead-copy small').evaluateAll(times => times.every(time => time.scrollWidth <= time.clientWidth + 1)));
    assert.ok(await board.locator('.stage-panel').evaluate(panel => panel.querySelector('.table-scroll').getBoundingClientRect().top - panel.getBoundingClientRect().top <= 55));
    assert.ok(await previewLinks.locator('.preview-team-logo').evaluateAll(logos => logos.every(logo => {
      const image = logo.getBoundingClientRect(), link = logo.closest('a').getBoundingClientRect();
      return image.width >= 14 && image.height >= 14 && image.left >= link.left && image.right <= link.right + 1;
    })));
    assert.ok(await previewLinks.evaluateAll(links => links.every(link => {
      const center = element => { const box = element.getBoundingClientRect(); return box.x + box.width / 2; };
      const [left, right] = [...link.querySelectorAll('.preview-team-logo')].map(center);
      return Math.abs(center(link) - (left + right) / 2) <= 1
        && Math.abs(center(link.querySelector('.preview-versus')) - center(link)) <= 1;
    })));
    assert.ok(await board.locator('.preview-more').evaluate(link => {
      const more = link.getBoundingClientRect(), last = link.parentElement.querySelector('.preview-lead:last-child').getBoundingClientRect();
      const section = link.parentElement.getBoundingClientRect();
      return more.width >= 44 && more.height >= 44 && more.left < last.right && more.right <= innerWidth + 1
        && Math.abs(last.right - section.right) <= 1;
    }));
    assert.ok(await previewLinks.last().evaluate(link => {
      const box = link.getBoundingClientRect();
      return document.elementFromPoint(box.left + box.width / 3, box.top + box.height / 2)?.closest('a') === link;
    }));
    if (width !== 375) await screenshot(`tournament-preview-cards-${width}.png`);
  }
  await stageTabs.getByRole('tab', { name: '季后赛', exact: true }).click();
  assert.equal(await previewLinks.count(), 0);
  assert.equal(await board.locator('.preview-more').count(), 0);
  await stageTabs.getByRole('tab', { name: '常规赛', exact: true }).click();
  assert.equal(await previewLinks.count(), 3);
  report.push({ check: 'Three rounded cards fill one 44px row with centered content and logos at symmetric outer edges; More overlays the last card without taking layout space at 320/375/390/1440px', previews: 3, passed: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    const more = board.locator('.preview-more');
    assert.equal(new URL(await more.getAttribute('href'), base).searchParams.get('seasonId'), '28');
    if (attempt === 0) await more.click();
    else { await more.focus(); await page.keyboard.press('Enter'); }
    await page.locator('.vis-tabs [aria-selected="true"]').getByText('比赛列表').waitFor();
    await page.locator('.tab-content.is-recent').waitFor();
    await page.waitForURL(url => url.searchParams.get('tab') === 'recent' && url.searchParams.get('seasonId') === '28');
    await page.locator('.vis-tabs').getByRole('tab', { name: '赛事进程' }).click();
    await previewLinks.first().waitFor();
  }
  report.push({ check: 'More opens the current season match-list tab on click and repeated keyboard activation after returning', passed: true });
  await page.setViewportSize({ width: 390, height: 480 });
  const fixedStageY = (await stageTabs.boundingBox()).y;
  const scrolled = await page.locator('.tab-content').evaluate(element => {
    element.scrollTop = 240;
    return element.scrollTop;
  });
  assert.ok(scrolled > 0);
  assert.ok(Math.abs((await stageTabs.boundingBox()).y - fixedStageY) <= 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.tab-content').evaluate(element => { element.scrollTop = 0; });
  await page.locator('.vis-tabs').getByRole('tab', { name: '赛事数据' }).click();
  await page.locator('.stats-category-choices').waitFor();
  assert.equal(await page.locator('#tournament-stage-tabs-host').isVisible(), false);
  await page.locator('.vis-tabs').getByRole('tab', { name: '赛事进程' }).click();
  await stageTabs.waitFor();
  assert.equal(await page.locator('.stats-category-choices').count(), 0);
  await board.scrollIntoViewIfNeeded();
  await screenshot('tournament-previews-korea-mobile.png');
  const firstUrl = await previewLinks.first().getAttribute('href');
  await previewLinks.first().click();
  await page.waitForURL(new URL(firstUrl, base).href);
  await page.locator('.upcoming-detail-page .match-banner').waitFor({ timeout: 60000 });
  let query = new URL(page.url()).searchParams;
  assert.equal(query.get('team1Id'), '25');
  assert.equal(query.get('team2Id'), '27');
  assert.equal(query.get('seasonId'), '28');
  assert.deepEqual(await page.locator('.match-banner .team-name').allTextContents(), ['CB', 'PF']);
  await page.getByRole('button', { name: '返回上一页' }).click();
  await board.locator('a.swiss-result[href*="upcoming-match"]').first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get('tournamentStage'), 'regular-season');
  const secondUrl = await previewLinks.nth(1).getAttribute('href');
  await previewLinks.nth(1).click();
  await page.waitForURL(new URL(secondUrl, base).href);
  await page.locator('.upcoming-detail-page .match-banner').waitFor({ timeout: 60000 });
  query = new URL(page.url()).searchParams;
  assert.deepEqual(await page.locator('.match-banner .team-name').allTextContents(), [query.get('t1'), query.get('t2')]);
  await page.getByRole('button', { name: '返回上一页' }).click();
  await previewLinks.first().waitFor();
  const cell = board.locator('a.swiss-result[href*="upcoming-match"]').first();
  const cellUrl = await cell.getAttribute('href');
  await cell.click();
  await page.waitForURL(new URL(cellUrl, base).href);
  await page.locator('.upcoming-detail-page .match-banner').waitFor({ timeout: 60000 });
  await page.reload();
  await page.locator('.upcoming-detail-page .match-banner').waitFor({ timeout: 60000 });
  query = new URL(page.url()).searchParams;
  assert.deepEqual(await page.locator('.match-banner .team-name').allTextContents(), [query.get('t1'), query.get('t2')]);
  report.push({ check: 'Unplayed table cells show date in the former blank score position; previews, refresh and return stage work', cells: links.length, previews: knownGames.length, passed: true });

  await page.goto(`${base}/visualize?seasonId=13&tab=overview&tournamentStage=swiss`);
  await board.locator('.swiss-result').first().waitFor();
  assert.equal(await board.locator('.result-score-date').count(), 0);
  assert.ok(await board.locator('.swiss-result').evaluateAll(cells => cells.filter(cell => /^\d+[:-]\d+$/.test(cell.querySelector('strong')?.textContent.trim() || '')).length >= 24));
  report.push({ check: 'Completed Swiss results retain scores and do not show dates in the score position', passed: true });

  await page.goto(`${base}/visualize?seasonId=13&tab=overview&tournamentStage=playoffs`);
  await board.locator('.bracket-node').first().waitFor();
  assert.ok(await board.locator('.bracket-node .opponent strong').evaluateAll(scores => scores.filter(score => /^\d+$/.test(score.textContent.trim())).length >= 8));
  assert.ok(await board.locator('.bracket-node time.round-time').count() >= 4);
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await board.locator('.round-header').evaluateAll(headers => headers.every(header => {
      const label = header.querySelector('.round-label'), time = header.querySelector('time');
      return label.scrollWidth <= label.clientWidth + 1
        && (!time || Math.abs(label.getBoundingClientRect().top - time.getBoundingClientRect().top) <= 4);
    })));
  }
  await board.scrollIntoViewIfNeeded();
  await screenshot('tournament-completed-bracket-mobile.png');

  await page.goto(`${base}/visualize?seasonId=28&tab=overview&tournamentStage=playoffs`);
  await board.locator('.bracket-node').first().waitFor();
  assert.equal(await board.locator('a.tournament-match').count(), 0);
  assert.equal(await board.locator('.preview-lead').count(), 0);
  assert.equal(await board.locator('.match-meta').count(), 0);
  assert.equal(await board.locator('.bracket-node time.round-time').count(), 6);
  assert.ok(await board.locator('.bracket-node time.round-time').evaluateAll(times => times.every(time => /^\d{2}\.\d{2} \d{2}:\d{2}$/.test(time.textContent.trim()))));
  await board.scrollIntoViewIfNeeded();
  await screenshot('tournament-dates-tbd-mobile.png');

  // Isolated browser fixture covers a future bracket and match-list-only stage.
  // Real Korean playoffs still have TBD opponents, so no invented live links.
  const known = raw.blocks.flatMap(block => block.matches || []).find(match => match.opponents.every(team => team.teamId));
  const fixture = structuredClone(raw);
  const bracket = fixture.blocks.find(block => block.type === 'bracket' && block.stageId === 'playoffs');
  bracket.matches[0].opponents = structuredClone(known.opponents);
  fixture.blocks = fixture.blocks.filter(block => block.stageId !== 'last-chance');
  fixture.blocks.push({ id: 'fixture-matches', type: 'matches', title: 'Preview fixture', stageId: 'last-chance',
    sourceTitle: 'Last Chance Qualifier', sourceUrl: raw.sourceUrl, matches: [{ ...known, id: 'fixture-preview', matchId: undefined }] });
  let fixtureReads = 0;
  await page.route('**/seasons/28/tournament', route => { fixtureReads++; return route.fulfill({ json: fixture }); });
  await page.reload();
  const card = board.locator('a.tournament-match[href*="upcoming-match"]');
  await card.waitFor();
  assert.ok(fixtureReads > 0);
  assert.equal(await card.locator('.match-meta').count(), 0);
  assert.ok(!(await card.innerText()).includes('前瞻'));
  assert.ok((await card.locator('xpath=..').locator('time.round-time').innerText()).match(/^\d{2}\.\d{2} \d{2}:\d{2}$/));
  assert.ok(await board.locator('.bracket-node').evaluateAll(nodes => nodes.every(node => {
    const rect = node.getBoundingClientRect(), canvas = node.parentElement.getBoundingClientRect();
    return rect.bottom <= canvas.bottom + 1;
  })));
  await screenshot('tournament-preview-bracket-fixture-mobile.png');
  await card.click();
  await page.waitForURL(/\/visualize\/upcoming-match\?/);
  await page.locator('.upcoming-detail-page .match-banner').waitFor({ timeout: 60000 });
  assert.equal(new URL(page.url()).searchParams.get('tournamentStage'), 'playoffs');
  await page.getByRole('button', { name: '返回上一页' }).click();
  await stageTabs.getByRole('tab', { name: '最后机会资格赛', exact: true }).click();
  const listCard = board.locator('.stage-match-list a.tournament-match[href*="upcoming-match"]');
  await listCard.waitFor();
  assert.ok(!(await listCard.innerText()).includes('前瞻'));
  assert.ok((await listCard.locator('xpath=..').locator('time.round-time').innerText()).match(/^\d{2}\.\d{2} \d{2}:\d{2}$/));
  await listCard.click();
  await page.waitForURL(/\/visualize\/upcoming-match\?/);
  assert.equal(new URL(page.url()).searchParams.get('tournamentStage'), 'last-chance');
  report.push({ check: 'Bracket title area shows date and time without changing card rows; known-opponent bracket and list cards still open previews', passed: true });

  await page.unroute('**/seasons/28/tournament');
  console.log('Checking the more-link threshold with isolated browser fixtures');
  const invalidGames = [
    { ...knownGames[3], id: 'fixture-tbd', opponents: knownGames[3].opponents.map(team => ({ ...team, teamId: null })) },
    { ...knownGames[4], id: 'fixture-no-time', timestamp: null },
    { ...knownGames[5], id: 'fixture-completed', hasLocalResults: true }
  ];
  let countFixture;
  await page.route('**/seasons/28/tournament', route => route.fulfill({ json: countFixture }));
  for (const count of [0, 1, 3, 4]) {
    const games = structuredClone(knownGames.slice(0, count));
    if (count) games.push(structuredClone(games[0]));
    countFixture = { ...raw, blocks: [{ id: 'fixture-preview-count', type: 'matches', stageId: 'regular-season',
      sourceTitle: 'Regular Season', sourceUrl: raw.sourceUrl, matches: [...games, ...invalidGames] }] };
    await page.goto(`${base}/visualize?seasonId=28&tab=overview&tournamentStage=regular-season`);
    await board.locator('.stage-match-list').waitFor();
    assert.equal(await previewLinks.count(), Math.min(count, 3));
    assert.equal(await board.locator('.preview-more').count(), count > 3 ? 1 : 0);
  }
  await page.unroute('**/seasons/28/tournament');
  report.push({ check: 'More is hidden with 0/1/3 eligible games and visible with 4; duplicates, TBD, missing times and completed games do not inflate the count', passed: true });

  let hiddenTabConfigReads = 0;
  await page.route('**/config/visualize_chart_config', route => {
    hiddenTabConfigReads++;
    return route.fulfill({ json: { overviewTab: false, recentTab: true, statsTab: true } });
  });
  await page.goto(`${base}/visualize?seasonId=28`);
  await page.locator('.vis-tabs [role="tab"]').first().waitFor();
  assert.ok(hiddenTabConfigReads > 0);
  assert.deepEqual(await page.locator('.vis-tabs [role="tab"]').allTextContents().then(labels => labels.map(label => label.trim())),
    ['比赛列表', '赛事数据']);
  assert.equal(await page.locator('.vis-tabs [aria-selected="true"]').innerText(), '比赛列表');
  await page.goto(`${base}/visualize?seasonId=28&tab=stats`);
  await page.locator('.vis-tabs [aria-selected="true"]').getByText('赛事数据').waitFor();
  await page.goto(`${base}/visualize?seasonId=28&tab=overview`);
  await page.locator('.vis-tabs [aria-selected="true"]').getByText('比赛列表').waitFor();
  report.push({ check: 'Home tabs follow configured visible order; valid explicit links survive and hidden-tab links fall back to the first visible tab', passed: true });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error);
  throw error;
} finally {
  releaseLoadingRequest?.();
  await writeFile(`${output}/tournament-preview-report.json`, JSON.stringify({ report, errors }, null, 2));
  await browser.close();
}
