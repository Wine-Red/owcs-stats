const { identityKey } = require('./LiquipediaRosterParser');

const indexNames = rows => {
  const index = new Map();
  for (const row of rows) {
    const key = identityKey(row.name);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
};

// MatchWeb externalId is not a Liquipedia identity. Names retain punctuation,
// accents and internal characters; only whitespace and case are normalized.
const matchRoster = (roster, { teams, players, seasonTeams = [], seasonPlayers = [] }) => {
  const teamIndex = indexNames(teams);
  const playerIndex = indexNames(players);
  const relationTeams = new Map(seasonTeams.map(row => [Number(row.id), Number(row.teamId)]));
  const rows = roster.teams.map(source => {
    const names = source.shortNames.length ? source.shortNames : [source.name];
    const candidates = names.length === 1 ? teamIndex.get(identityKey(names[0])) || [] : [];
    const team = candidates.length === 1 ? candidates[0] : null;
    const teamReason = names.length > 1 ? '页面存在多个不同简称，无法唯一确认队伍' :
      !candidates.length ? `数据库中不存在队伍 ${names[0]}${source.shortNames.length ? '' : '（页面未提供简称）'}` :
        candidates.length > 1 ? '数据库存在多个同名队伍' : '';
    return {
      ...source,
      teamId: team ? Number(team.id) : null,
      matchedName: team?.name || '',
      status: team ? 'matched' : 'skipped',
      reason: teamReason,
      existing: !!team && seasonTeams.some(row => Number(row.teamId) === Number(team.id)),
      players: source.players.map(player => {
        const matches = playerIndex.get(identityKey(player.name)) || [];
        const match = matches.length === 1 ? matches[0] : null;
        const sourceRole = { dps: 'damage', damage: 'damage', tank: 'tank', support: 'support' }[identityKey(player.role)];
        const roleConflict = sourceRole && match?.role && sourceRole !== match.role;
        const otherTeams = match && team ? seasonPlayers
          .filter(row => Number(row.playerId) === Number(match.id))
          .map(row => relationTeams.get(Number(row.seasonTeamId)))
          .filter(teamId => teamId !== undefined && teamId !== Number(team.id)) : [];
        const reason = !team ? '所属队伍未匹配，跳过选手关联' :
          !matches.length ? '数据库中不存在该选手' :
            matches.length > 1 ? '数据库存在多个同名选手，需要人工核对' :
              otherTeams.length ? `该选手已关联本赛季其他队伍：${[...new Set(otherTeams)].map(id => teams.find(t => Number(t.id) === id)?.name || id).join('、')}，需要人工核对转会或身份` :
                roleConflict ? `选手位置不一致（页面 ${sourceRole}，数据库 ${match.role}），需要人工核对` : '';
        return { ...player, playerId: match ? Number(match.id) : null, matchedName: match?.name || '',
          status: reason ? 'skipped' : 'matched', reason,
          existing: !!match && !!team && seasonPlayers.some(row => Number(row.playerId) === Number(match.id) && relationTeams.get(Number(row.seasonTeamId)) === Number(team.id)) };
      })
    };
  });
  // A page can contain conflicting team cards or distinct people with the same
  // displayed ID. Reject all affected candidates, including the first one.
  for (const row of rows) {
    if (row.teamId && rows.filter(other => other.teamId === row.teamId).length > 1) {
      row.status = 'skipped';
      row.reason = '多个 Liquipedia 队伍指向同一数据库队伍，需要人工核对';
      row.players.forEach(player => { player.status = 'skipped'; player.reason = '所属队伍身份冲突'; });
    }
  }
  const occurrences = new Map();
  for (const row of rows) for (const player of row.players) {
    const key = identityKey(player.name);
    if (!occurrences.has(key)) occurrences.set(key, []);
    occurrences.get(key).push({ row, player });
  }
  for (const entries of occurrences.values()) {
    if (new Set(entries.map(({ row }) => row.link)).size > 1 || new Set(entries.map(({ player }) => player.link)).size > 1) {
      entries.forEach(({ player }) => { player.status = 'skipped'; player.reason = '赛事页面中该选手名对应多个队伍或身份，需要人工核对'; });
    }
  }
  const byLink = new Map();
  for (const row of rows) for (const player of row.players) {
    if (!byLink.has(player.link)) byLink.set(player.link, []);
    byLink.get(player.link).push(player);
  }
  for (const entries of byLink.values()) {
    if (new Set(entries.map(player => player.playerId).filter(Boolean)).size > 1) {
      entries.forEach(player => { player.status = 'skipped'; player.reason = '同一 Liquipedia 选手页面匹配到多个数据库身份，需要人工核对'; });
    }
  }
  const allPlayers = rows.flatMap(row => row.players);
  return {
    teams: rows, warnings: roster.warnings,
    summary: {
      totalTeams: rows.length, matchedTeams: rows.filter(row => row.status === 'matched').length,
      newTeams: rows.filter(row => row.status === 'matched' && !row.existing).length,
      skippedTeams: rows.filter(row => row.status === 'skipped').length,
      totalPlayers: allPlayers.length, matchedPlayers: allPlayers.filter(row => row.status === 'matched').length,
      newPlayers: allPlayers.filter(row => row.status === 'matched' && !row.existing).length,
      skippedPlayers: allPlayers.filter(row => row.status === 'skipped').length
    }
  };
};

module.exports = { matchRoster };
