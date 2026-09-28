import { stageDateRange, tournamentYear } from './tournamentStageDates.mjs';

import { stageName, stageTitles, declaredStages, classifyTournamentBlocks } from '../../backend/services/tournamentSemantics.mjs';
import { attachStageResults } from './tournamentResults.mjs';

export function groupTournamentStages(snapshot) {
  if (!snapshot) return [];
  const classified = classifyTournamentBlocks(snapshot);
  const declared = declaredStages(snapshot);
  const groups = new Map();
  for (const { block, stageId } of classified) {
    if (!groups.has(stageId)) groups.set(stageId, { id: stageId, title: stageTitles[stageId], blocks: [],
      dateRange: stageDateRange((snapshot.rules || []).filter(rule => rule.level === 0 && stageName(rule.original) === stageId), tournamentYear(snapshot)) });
    groups.get(stageId).blocks.push(block);
  }
  const splitRegular = groups.has('swiss') && groups.has('round-robin');
  const order = [...new Set([...declared.flatMap(stage => stage === 'regular-season' && splitRegular
    ? ['swiss', 'round-robin'] : [stage]), ...groups.keys()])];
  if (groups.size === 1 && groups.has('other')) groups.get('other').title = '赛事进程';
  let current;
  for (const rule of snapshot.rules || []) {
    if (rule.level === 0) current = stageName(rule.original);
    const stage = groups.get(current);
    if (!stage) continue;
    if (/results of regular season carry over/i.test(rule.original)) stage.carryOver = 'regular-season';
    if (/^(?:Single |Double )?Round Robin(?: with \d+ groups)?\.?$/i.test(rule.original)) stage.roundRobinCycles = /^Double/i.test(rule.original) ? 2 : 1;
  }
  for (const stage of groups.values()) if (stage.carryOver) {
    stage.baselineTables = groups.get(stage.carryOver)?.blocks.filter(block => block.type === 'standings') || [];
  }
  return [...groups.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

// Retain the compact tables/brackets when they exist. A source stage with only
// a match list (e.g. Korea's seeding stage) must still be reachable and visible.
export function tournamentStageDisplayBlocks(stage, snapshot = {}) {
  stage = attachStageResults(stage, snapshot);
  const compact = stage.blocks.filter(block => block.rows || block.type === 'bracket');
  return (compact.length ? compact : stage.blocks.filter(block => block.matches?.length)).map(block => {
    let title = block.title;
    // Display old snapshots with today's terminology; source text stays intact.
    if (/Playoffs/i.test(block.sourceTitle || '')) title = title?.replace(/淘汰赛/g, '季后赛');
    if (stage.id === 'playoff-seeding') title = `${stage.title} · ${block.rows ? '积分' : '赛程'}`;
    if (stage.id === 'round-robin' && block.type === 'standings') title = '循环赛积分';
    return { ...block, title };
  });
}

export function selectTournamentStage(stages, requested, now = Date.now()) {
  const explicit = stages.find(stage => stage.id === requested);
  if (explicit) return explicit;
  const time = new Date(now).getTime();
  if (!Number.isFinite(time)) return stages[0] || null;
  // Source ranges are calendar days. Use Beijing's day independently of the
  // viewer's time zone, including the whole start and end dates.
  const today = new Date(time + 8 * 3600000).toISOString().slice(0, 10);
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const dated = stages.filter(({ dateRange: range }) => range && validDay(range.startDate)
    && validDay(range.endDate) && range.startDate <= range.endDate);
  // Concurrent phases retain source order, e.g. Korea's seeding and last chance.
  const ongoing = dated.find(({ dateRange: range }) => range.startDate <= today && today <= range.endDate);
  if (ongoing) return ongoing;
  // Between phases, show the next scheduled phase so its previews are reachable.
  const upcoming = dated.filter(stage => stage.dateRange.startDate > today)
    .reduce((first, stage) => !first || stage.dateRange.startDate < first.dateRange.startDate ? stage : first, null);
  if (upcoming) return upcoming;
  const ended = dated.filter(stage => stage.dateRange.endDate < today)
    .reduce((latest, stage) => !latest || stage.dateRange.endDate >= latest.dateRange.endDate ? stage : latest, null);
  return ended || stages[0] || null;
}
