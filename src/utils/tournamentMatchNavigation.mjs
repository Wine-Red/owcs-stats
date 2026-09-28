const dateFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false });

export function tournamentMatchNavigation(match, { seasonId, tournament = '', stageId, now = Date.now(), blocked = false } = {}) {
  const timestamp = Number.isFinite(match.timestamp) && match.timestamp > 0 ? match.timestamp : null;
  const navigation = {
    date: timestamp ? dateFormatter.format(timestamp).replace('/', '.') : '日期待定',
    time: timestamp ? timeFormatter.format(timestamp) : '',
    datetime: timestamp ? new Date(timestamp).toISOString() : undefined,
    preview: false, to: null
  };
  if (blocked || match.sourceConflict) return navigation;
  const opponents = match.opponents || [];
  const known = opponents.length === 2 && opponents.every(team => Number.isSafeInteger(Number(team.teamId)) && Number(team.teamId) > 0)
    && Number(opponents[0].teamId) !== Number(opponents[1].teamId);
  const unplayed = opponents.length === 2 && opponents.every(team => team.score == null || team.score === 0);
  if (timestamp > now && known && unplayed && !match.hasLocalResults && seasonId) {
    navigation.preview = true;
    navigation.to = { path: '/visualize/upcoming-match', query: {
      seasonId, team1Id: opponents[0].teamId, team2Id: opponents[1].teamId,
      t1: opponents[0].localName || opponents[0].shortName || opponents[0].name,
      t2: opponents[1].localName || opponents[1].shortName || opponents[1].name,
      time: timestamp, tournament, from: 'tournament', returnSeasonId: seasonId,
      ...(stageId ? { tournamentStage: stageId } : {})
    } };
  } else if (match.matchId) {
    navigation.to = { path: '/visualize/match-detail', query: {
      seasonId: match.matchSeasonId ?? seasonId, matchId: match.matchId, tab: 'overview'
    } };
  }
  return navigation;
}

export function attachTournamentNavigation(snapshot, options) {
  if (!snapshot?.blocks) return snapshot;
  return { ...snapshot, blocks: snapshot.blocks.map(block => {
    const decorate = match => ({ ...match, navigation: tournamentMatchNavigation(match, {
      ...options, stageId: block.stageId || block.sourceStage, blocked: Boolean(block.stageIssue)
    }) });
    return { ...block,
      ...(block.matches ? { matches: block.matches.map(decorate) } : {}),
      ...(block.rows ? { rows: block.rows.map(row => ({ ...row,
        ...(row.rounds ? { rounds: row.rounds.map(decorate) } : {})
      })) } : {})
    };
  }) };
}

export function collectTournamentPreviews(blocks = []) {
  const previews = new Map();
  for (const block of blocks) {
    const matches = [
      ...(block.matches || []),
      ...(block.rows || []).flatMap(row => [...(row.games || []), ...(row.rounds || [])])
    ];
    for (const match of matches) {
      if (!match.navigation?.preview || !match.navigation.to) continue;
      // Both team rows and repeated source blocks can represent the same game.
      // Include its time so a later rematch remains a separate preview.
      const pair = match.opponents.map(team => Number(team.teamId)).sort((a, b) => a - b);
      const previewKey = `${match.navigation.to.query.seasonId}:${pair.join(':')}:${match.timestamp}`;
      if (!previews.has(previewKey)) previews.set(previewKey, { ...match, previewKey });
    }
  }
  return [...previews.values()].sort((a, b) => a.timestamp - b.timestamp || a.previewKey.localeCompare(b.previewKey));
}
