const normalizeRole = role => {
  const value = String(role || '').toLowerCase();
  return ['tank', 'damage', 'support'].includes(value) ? value : 'damage';
};

const playerKey = player => {
  const id = player?.id ?? player?.playerId;
  if (id !== undefined && id !== null && id !== '') return `id:${id}`;
  const name = String(player?.name || player?.playerName || '').trim().toLocaleLowerCase('en-US');
  return name ? `name:${name}` : '';
};

const registeredPlayerFromRelation = relation => {
  const player = relation?.Player || relation?.player || {};
  return {
    id: relation?.playerId ?? player.id ?? null,
    name: String(player.name || relation?.playerName || '未知'),
    role: normalizeRole(player.role || relation?.role),
    gameTime: 0
  };
};

const statsPlayer = (stat, fallbackTeamId) => ({
  id: stat?.playerId ?? stat?.player?.id ?? null,
  name: String(stat?.player?.name || stat?.playerName || '未知'),
  teamId: stat?.teamId ?? stat?.team?.id ?? fallbackTeamId,
  role: normalizeRole(stat?.player?.role || stat?.role),
  gameTime: Number(stat?.gameTime ?? stat?.totalDuration) || 0
});

const mergeRegisteredRosterWithStats = (relations, seasonStats, teamId) => {
  const roster = new Map();

  (Array.isArray(relations) ? relations : []).forEach(relation => {
    const player = registeredPlayerFromRelation(relation);
    const key = playerKey(player);
    if (key) roster.set(key, { ...player, teamId });
  });

  (Array.isArray(seasonStats) ? seasonStats : [])
    .filter(stat => String(stat?.teamId ?? stat?.team?.id ?? '') === String(teamId))
    .forEach(stat => {
      const player = statsPlayer(stat, teamId);
      const key = playerKey(player);
      if (!key) return;

      const registered = roster.get(key);
      roster.set(key, registered
        ? {
            ...registered,
            name: registered.name === '未知' ? player.name : registered.name,
            role: registered.role || player.role,
            gameTime: Math.max(registered.gameTime, player.gameTime)
          }
        : player);
    });

  return [...roster.values()];
};

export { mergeRegisteredRosterWithStats, normalizeRole };
