import { classifyTournamentBlocks, stageTitles } from '../../backend/services/tournamentSemantics.mjs';

const DAY = 86400000;
const dayNumber = key => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return null;
  const time = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === key ? time / DAY : null;
};
const weekNumber = value => {
  const text = String(value || '').replace(/_/g, ' ');
  const found = text.match(/\bWeek\s+(\d+)\b/i) || text.match(/第\s*(\d+)\s*周/);
  return found && Number(found[1]) > 0 ? Number(found[1]) : null;
};
const sourcePage = value => String(value || '').split('#')[0].replace(/\/$/, '');
const localDateKey = timestamp => {
  const date = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const dateRangeLabel = (start, end) => {
  const format = key => (start.slice(0, 4) === end.slice(0, 4) ? key.slice(5) : key).replace(/-/g, '.');
  return start === end ? format(start) : `${format(start)} – ${format(end)}`;
};

// Official Week headings/anchors are authoritative, independent of weekdays and
// the viewer's time zone. Unlabelled legacy schedules use contiguous event days:
// two full rest days split a group; an unlabelled group spans at most seven days.
export function groupMatchDaysByWeek(options, { snapshot, matches = [], toDateKey = localDateKey } = {}) {
  const days = new Map();
  const weeks = new Map();
  const classified = classifyTournamentBlocks(snapshot || {});
  const stageLabels = { ...stageTitles };
  // A single unnamed bracket can use its explicitly declared whole-event
  // format (e.g. Tokyo). Do not infer "playoffs" from bracket shape alone.
  const wholeEventFormats = [...new Set((snapshot?.rules || []).filter(rule => rule.level === 0).map(rule => {
    const format = String(rule.original || '').trim();
    if (/^Double[- ]elimination bracket\.?$/i.test(format)) return '双败淘汰赛';
    if (/^Single[- ]elimination bracket\.?$/i.test(format)) return '单败淘汰赛';
    return null;
  }).filter(Boolean))];
  const unnamedBracket = classified.length === 1 && classified[0].stageId === 'other'
    && !classified[0].issue && classified[0].block.type === 'bracket' && wholeEventFormats.length === 1;
  if (unnamedBracket) stageLabels['main-bracket'] = wholeEventFormats[0];
  const recorded = new Map(matches.filter(match => match.source === 'recorded').map(match => [String(match.id), match]));
  const addDay = (key, week, stageId, isRecorded = false) => {
    const day = dayNumber(key);
    if (day === null) return;
    if (!days.has(key)) days.set(key, {
      key, day, weeks: new Set(), stages: new Set(), recordedWeeks: new Set(), recordedStages: new Set()
    });
    const entry = days.get(key);
    if (stageId && stageId !== 'other') {
      entry.stages.add(stageId);
      if (isRecorded) entry.recordedStages.add(stageId);
    }
    if (week) {
      entry.weeks.add(week.key);
      if (isRecorded) entry.recordedWeeks.add(week.key);
      week.start = Math.min(week.start, day);
      week.end = Math.max(week.end, day);
    }
  };
  const getWeek = (url, number, stageId) => {
    if (!number) return null;
    const key = `${sourcePage(url)}#week-${number}`;
    if (!weeks.has(key)) weeks.set(key, { key, number, stageId, start: Infinity, end: -Infinity });
    return weeks.get(key);
  };
  for (const { block, stageId: sourceStageId, issue } of classified) {
    if (issue) continue;
    const stageId = unnamedBracket ? 'main-bracket' : sourceStageId;
    const number = [...(block.sourceHeadings || []), block.sourceTitle, block.title].map(weekNumber).find(Boolean);
    const week = getWeek(block.sourceUrl || snapshot?.sourceUrl, number, stageId);
    for (const match of block.matches || []) {
      if (Number.isFinite(match.timestamp)) addDay(toDateKey(match.timestamp), week, stageId);
      // Preserve date-only local records when their source kickoff falls on the
      // adjacent calendar day; never rewrite their stored date or invent a time.
      const local = recorded.get(String(match.matchId));
      if (local) addDay(local.dateKey, week, stageId, true);
    }
  }
  for (const match of matches) {
    let anchor = '';
    try { anchor = decodeURIComponent(new URL(match.link).hash); } catch { /* Recorded matches need no source link. */ }
    addDay(match.dateKey, getWeek(match.link, weekNumber(anchor)));
  }
  for (const option of options) addDay(option.key);

  const orderedDays = [...days.values()].sort((a, b) => a.day - b.day);
  const groups = new Map();
  const groupByDate = new Map();
  let previous, inferred;
  for (const date of orderedDays) {
    // A local day may appear in more than one source week. Keep its button once
    // without choosing an arbitrary official week in that ambiguous case.
    // Verified local match identities take priority over other stages whose
    // source timestamps happen to fall on the same displayed calendar day.
    const stageIds = [...(date.recordedStages.size ? date.recordedStages : date.stages)].sort();
    const stageKey = stageIds.join('|');
    const assignedWeeks = date.recordedStages.size ? date.recordedWeeks : date.weeks;
    const candidates = assignedWeeks.size || date.recordedStages.size
      ? [...assignedWeeks].map(key => weeks.get(key))
      : [...weeks.values()].filter(week => week.start <= date.day && date.day <= week.end
        && (!stageIds.length || stageIds.includes(week.stageId)));
    const official = candidates.length === 1 && stageIds.length <= 1 ? candidates[0] : null;
    let group;
    if (official) {
      if (!groups.has(official.key)) groups.set(official.key, { ...official, options: [], dates: [] });
      group = groups.get(official.key);
      inferred = null;
    } else {
      if (!inferred || inferred.stageKey !== stageKey || date.day - previous.day >= 3 || date.day - inferred.start >= 7) {
        inferred = { key: `match-week-${date.key}`, start: date.day, stageIds, stageKey, options: [], dates: [] };
        groups.set(inferred.key, inferred);
      }
      group = inferred;
    }
    group.dates.push(date.key);
    groupByDate.set(date.key, group);
    previous = date;
  }
  const pending = [];
  for (const option of options) {
    const group = groupByDate.get(option.key);
    if (group) group.options.push(option);
    else pending.push(option);
  }
  const result = [...groups.values()].filter(group => group.options.length).sort((a, b) => a.start - b.start).map(group => {
    const stage = (group.stageIds || [group.stageId]).filter(id => id !== 'other').map(id => stageLabels[id]).filter(Boolean).join(' / ');
    return {
      key: group.key,
      label: group.number ? `${stage ? `${stage} · ` : ''}第 ${group.number} 周` : stage || '比赛周',
      rangeLabel: dateRangeLabel(group.dates[0], group.dates.at(-1)),
      options: group.options.sort((a, b) => a.key.localeCompare(b.key))
    };
  });
  if (pending.length) result.push({ key: 'tbd', label: '时间待定', rangeLabel: '', options: pending });
  return result;
}
