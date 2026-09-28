const client = require('./LiquipediaClient');
const { parseTournamentUrl } = require('./LiquipediaRosterParser');
const { parseTournamentHtml } = require('./LiquipediaTournamentParser');

const SNAPSHOT_VERSION = 2;
const validSnapshot = (snapshot, page) => snapshot?.version === SNAPSHOT_VERSION && snapshot.page === page
  && Number.isFinite(snapshot.observedAt) && snapshot.blocks?.length > 0;

async function loadTournamentSnapshot(source, {
  fetchPage = client.fetchParsedHtml, fetchCanonicalPages = client.fetchCanonicalPages, now = Date.now,
  maxPages = 12, maxDepth = 3
} = {}) {
  const { stageName, sourcePath, headingsOf, declaredStages, classifyTournamentBlocks, groupKey, isQualifier, compatibleStages } = await import('./tournamentSemantics.mjs');
  const rootResponse = await fetchPage({ page: source.page });
  const root = parseTournamentHtml({ ...rootResponse, page: (rootResponse.title || source.page).replace(/_/g, ' '), allowEmpty: true });
  const pages = [root], visited = new Set([source.page, root.page]), diagnostics = [], queue = [];
  const requestedStages = new Set([...declaredStages(root), ...classifyTournamentBlocks(root).map(entry => entry.stageId)]);
  const eventRoot = root.page.replace(/\/(?:Regular Season|Group Stage|Playoffs|Swiss|Open Qualifier|Closed Qualifier)(?:\/.*)?$/i, '');
  const configuredStage = sourcePath(root.sourceUrl).map(stageName).filter(Boolean).at(-1);
  if (configuredStage) requestedStages.add(configuredStage);
  const discover = (parsed, depth, inheritedStage) => {
    for (const link of parsed.links) {
      if (!link.page.startsWith(`${eventRoot}/`) || visited.has(link.page) || link.kind === 'reference') continue;
      const pathStages = link.page.split('/').map(stageName).filter(Boolean);
      const pathStage = pathStages.find(isQualifier) || pathStages.at(-1);
      const headingStage = link.sourceHeadings.map(stageName).filter(Boolean).at(-1);
      const stage = pathStage || stageName(link.label) || (link.kind === 'detail' ? headingStage || inheritedStage : null);
      const reject = reason => diagnostics.push({ page: link.page, from: parsed.page, reason });
      if (!stage) { reject(link.kind === 'navigation' ? 'unclassified-navigation' : 'unknown-stage'); continue; }
      // A participants/qualification reference is never a detailed-results edge.
      // Sibling qualifiers are collected only when the configured event includes them.
      if (isQualifier(stage) && !requestedStages.has(stage)) { reject('outside-requested-stages'); continue; }
      if (configuredStage && !compatibleStages(configuredStage, stage)) { reject('outside-configured-stage'); continue; }
      if (link.kind === 'detail' && headingStage && !compatibleStages(headingStage, stage)) { reject('stage-conflict'); continue; }
      if (depth >= maxDepth) { reject('depth-limit'); continue; }
      const group = link.kind === 'detail' ? groupKey({ sourceHeadings: link.sourceHeadings }) : '';
      const previous = queue.find(item => item.page === link.page);
      if (previous) {
        if (previous.stage !== stage || (previous.group && group && previous.group !== group)) previous.conflict = true;
        else if (group && !previous.group) { previous.group = group; previous.kind = link.kind; previous.sourceHeadings = link.sourceHeadings; }
        continue;
      }
      queue.push({ ...link, stage, group, depth: depth + 1, from: parsed.page });
    }
  };
  discover(root, 0, configuredStage);
  while (queue.length) {
    const edge = queue.shift();
    if (visited.has(edge.page)) continue;
    visited.add(edge.page);
    if (edge.conflict) { diagnostics.push({ page: edge.page, reason: 'ambiguous-link-context' }); continue; }
    if (pages.length >= maxPages) { diagnostics.push({ page: edge.page, reason: 'page-limit' }); continue; }
    // Failed reads keep the previous complete snapshot, never publish half an update.
    const response = await fetchPage({ page: edge.page });
    const canonicalPage = (response.title || edge.page).replace(/_/g, ' ');
    if (canonicalPage !== eventRoot && !canonicalPage.startsWith(`${eventRoot}/`)) throw new Error(`赛程子页重定向到其他赛事：${edge.page}`);
    if (canonicalPage !== edge.page && visited.has(canonicalPage)) { diagnostics.push({ page: edge.page, reason: 'duplicate-redirect' }); continue; }
    visited.add(canonicalPage);
    const parsed = parseTournamentHtml({ ...response, page: canonicalPage, allowEmpty: true });
    for (const block of parsed.blocks) {
      block.sourceStage = edge.stage;
      if (edge.group) block.sourceGroup = edge.group;
    }
    parsed.discoveredFrom = { page: edge.from, kind: edge.kind, headings: edge.sourceHeadings, stage: edge.stage };
    pages.push(parsed);
    const before = queue.length;
    discover(parsed, edge.depth, edge.stage);
    if (!parsed.blocks.length && queue.length === before) throw new Error(`赛程子页没有可解析内容：${edge.page}`);
  }
  if (!pages.some(page => page.blocks.length)) throw new Error('未识别到可展示的积分表或对阵，保留上次同步结果');
  const sourceTeams = pages.flatMap(p => p.blocks.flatMap(b => [...(b.matches || []).flatMap(m => m.opponents),
    ...(b.rows || []).flatMap(r => [r.team, ...(r.rounds || []).map(round => round.opponent)])]));
  const shortNames = new Map();
  for (const team of sourceTeams) if (team.shortName !== team.name) shortNames.set(team.url || team.name, team.shortName);
  for (const team of sourceTeams) if (shortNames.has(team.url || team.name)) team.shortName = shortNames.get(team.url || team.name);
  const redirects = await fetchCanonicalPages(sourceTeams.filter(t => t.url).map(t => parseTournamentUrl(t.url).page));
  const fingerprints = new Set();
  const classified = classifyTournamentBlocks({ ...root, blocks: pages.flatMap(page => page.blocks) });
  const blocks = classified.filter(({ block, stageId, groupKey, issue }) => {
    Object.assign(block, { stageId, groupKey });
    if (issue) block.stageIssue = issue;
    // Identical teams/scores in separate phases are not duplicate representations.
    const fingerprint = JSON.stringify({ stageId, groupKey, unknownScope: stageId === 'other' ? [block.sourceUrl, headingsOf(block)] : null, type: block.type, rows: block.rows,
      matches: block.matches?.map(m => ({ opponents: m.opponents, timestamp: m.timestamp, round: m.round })) });
    if (fingerprints.has(fingerprint)) return false;
    fingerprints.add(fingerprint); return true;
  }).map(entry => entry.block);
  return { version: SNAPSHOT_VERSION, page: source.page, sourceUrl: source.url, observedAt: now(), rules: root.rules,
    blocks, redirects, warnings: [...new Set(pages.flatMap(p => p.warnings))],
    discovery: { diagnostics, complete: !diagnostics.some(d => !['outside-requested-stages', 'outside-configured-stage', 'unclassified-navigation', 'duplicate-redirect'].includes(d.reason)) },
    sources: pages.map(p => ({ url: p.sourceUrl, revisionId: p.revisionId, discoveredFrom: p.discoveredFrom })) };
}

module.exports = { loadTournamentSnapshot, validSnapshot, SNAPSHOT_VERSION };
