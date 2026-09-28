// Pure source semantics shared by the collector and the display (including old snapshots).
export const clean = value => String(value || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
export const stageTitles = {
  swiss: '瑞士轮', 'round-robin': '循环赛', 'regular-season': '常规赛', groups: '小组赛',
  'playoff-seeding': '季后赛种子决定战', 'last-chance': '最后机会资格赛', playoffs: '季后赛',
  'open-qualifier': '公开预选赛', 'closed-qualifier': '封闭预选赛', qualifier: '预选赛', 'play-in': '入围赛', other: '其他赛程'
};
export function stageName(value) {
  const name = clean(value).replace(/^Standings\s*[-–:]\s*/i, '').split(':')[0].trim();
  if (/^Playoffs Seeding Decider(?: Matches)?$/i.test(name)) return 'playoff-seeding';
  if (/^Last Chance Qualifier$/i.test(name)) return 'last-chance';
  if (/^Open Qualifiers?$/i.test(name)) return 'open-qualifier';
  if (/^Closed Qualifiers?$/i.test(name)) return 'closed-qualifier';
  if (/^Qualifiers?$/i.test(name)) return 'qualifier';
  if (/^Play[- ]?Ins?$/i.test(name)) return 'play-in';
  if (/^(?:Regular Season\s*[-–]\s*)?Swiss(?: Stage)?$/i.test(name)) return 'swiss';
  if (/^(?:Regular Season\s*[-–]\s*)?Round Robin(?: Stage)?$/i.test(name)) return 'round-robin';
  if (/^Group Stage$/i.test(name)) return 'groups';
  if (/^(?:Regional )?Playoffs$/i.test(name)) return 'playoffs';
  if (/^Regular Season$/i.test(name)) return 'regular-season';
  return null;
}
export const headingsOf = block => block.sourceHeadings?.length ? block.sourceHeadings : [block.sourceTitle];
export const sourcePath = value => {
  try { return new URL(value).pathname.split('/').map(part => clean(decodeURIComponent(part))); }
  catch { return clean(value).split('/'); }
};
export const isQualifier = stage => ['open-qualifier', 'closed-qualifier', 'qualifier'].includes(stage);
export const compatibleStages = (parent, child) => !parent || !child || parent === child
  || (parent === 'regular-season' && ['swiss', 'round-robin'].includes(child));
const headingGroup = block => headingsOf(block).map(clean).filter(title => /^Group\s+(?:[A-Z]|\d+)$/i.test(title)).at(-1)?.toLowerCase() || '';
export const groupKey = block => headingGroup(block) || block.sourceGroup || '';
export const declaredStages = snapshot => [...new Set((snapshot.rules || []).filter(rule => rule.level === 0)
  .map(rule => stageName(rule.original)).filter(Boolean))];

export function classifyTournamentBlocks(snapshot) {
  const blocks = snapshot?.blocks || [];
  const evidenced = new Set([...declaredStages(snapshot || {}), ...blocks.flatMap(block => headingsOf(block).map(stageName)).filter(Boolean)]);
  const hasSwiss = evidenced.has('swiss') || blocks.some(block => block.type === 'swiss');
  const splitRegular = hasSwiss && evidenced.has('round-robin');
  return blocks.map(block => {
    const headings = headingsOf(block);
    const pathStages = sourcePath(block.sourceUrl || snapshot.sourceUrl).map(stageName).filter(Boolean);
    const qualifier = pathStages.find(isQualifier) || headings.map(stageName).find(isQualifier)
      || (isQualifier(block.sourceStage) ? block.sourceStage : null);
    let stage = qualifier || headings.map(stageName).filter(Boolean).at(-1) || pathStages.at(-1) || block.sourceStage;
    let issue = block.stageIssue || null;
    if (block.sourceGroup && headingGroup(block) && block.sourceGroup !== headingGroup(block)) issue = 'group-conflict';
    if (!qualifier && block.sourceStage && !compatibleStages(block.sourceStage, stage)) issue = 'stage-conflict';
    if (!stage || stage === 'regular-season') {
      const decider = /\b(?:Seeding )?Decider\b/i.test(block.sourceTitle || '')
        || (block.matches?.length > 0 && block.matches.every(match => /\bDecider\b/i.test(match.sourceRound || '')));
      if (block.type === 'swiss') stage = 'swiss';
      else if (hasSwiss && decider && (stage === 'regular-season' || /^Seeding Decider(?: Matches)?$/i.test(clean(block.sourceTitle)))) stage = 'swiss';
      else if (splitRegular && stage === 'regular-season') {
        if (block.type === 'standings' || /^GS Week\s+\d+$/i.test(clean(block.sourceTitle))) stage = 'round-robin';
        else if (/^Round\s+\d+$/i.test(clean(block.sourceTitle))) stage = 'swiss';
      }
    }
    if (!stage && /^Group\s+[A-Z0-9]+$/i.test(clean(block.sourceTitle))) stage = 'groups';
    return { block, stageId: issue ? 'other' : stage || 'other', groupKey: groupKey(block), issue };
  });
}

export function scopeTournamentSnapshot(snapshot) {
  return { ...snapshot, blocks: classifyTournamentBlocks(snapshot).map(({ block, stageId, groupKey, issue }) =>
    ({ ...block, stageId, groupKey, ...(issue ? { stageIssue: issue } : {}) })) };
}
