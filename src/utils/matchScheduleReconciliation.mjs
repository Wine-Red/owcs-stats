const TBD_TEAM_NAMES = new Set(['', 'tbd', 'to be determined', 'unknown']);

const normalizeTeamName = value => String(value || '')
  .normalize('NFKC')
  .trim()
  .toLocaleLowerCase('en-US')
  .replace(/[\s._-]+/g, '');

const getTeamIdentity = team => ({
  id: team?.id == null ? '' : String(team.id),
  name: normalizeTeamName(team?.name)
});

const isKnownTeam = identity => identity.id || !TBD_TEAM_NAMES.has(identity.name);

const isSameTeam = (left, right) => {
  const leftIdentity = getTeamIdentity(left);
  const rightIdentity = getTeamIdentity(right);

  if (!isKnownTeam(leftIdentity) || !isKnownTeam(rightIdentity)) return false;
  if (leftIdentity.id && rightIdentity.id) return leftIdentity.id === rightIdentity.id;
  return Boolean(leftIdentity.name && leftIdentity.name === rightIdentity.name);
};

const isSameScheduledMatch = (upcoming, recorded) => {
  if (!upcoming?.dateKey || upcoming.dateKey === 'tbd') return false;
  if (upcoming.dateKey !== recorded?.dateKey) return false;

  return (
    isSameTeam(upcoming.team1, recorded.team1)
    && isSameTeam(upcoming.team2, recorded.team2)
  ) || (
    isSameTeam(upcoming.team1, recorded.team2)
    && isSameTeam(upcoming.team2, recorded.team1)
  );
};

const getRecordedMatchState = match => {
  const formatMatch = String(match?.boFormat || '').trim().match(/^BO\s*(\d+)$/i);
  if (!formatMatch) return 'completed';

  const maximumGames = Number(formatMatch[1]);
  if (!Number.isInteger(maximumGames) || maximumGames < 1) return 'completed';

  const requiredWins = Math.floor(maximumGames / 2) + 1;
  const team1Score = Number(match?.team1Score);
  const team2Score = Number(match?.team2Score);
  const hasFinished = (
    (Number.isFinite(team1Score) && team1Score >= requiredWins)
    || (Number.isFinite(team2Score) && team2Score >= requiredWins)
  );

  return hasFinished ? 'completed' : 'ongoing';
};

/**
 * Removes stale upcoming entries once the same match is present in local data.
 * Recorded matches are consumed one at a time so same-day rematches are retained.
 */
const removeRecordedFromUpcoming = (upcomingMatches, recordedMatches) => {
  const unmatchedRecorded = [...recordedMatches];

  return upcomingMatches.filter(upcoming => {
    const recordedIndex = unmatchedRecorded.findIndex(recorded => (
      isSameScheduledMatch(upcoming, recorded)
    ));

    if (recordedIndex === -1) return true;
    unmatchedRecorded.splice(recordedIndex, 1);
    return false;
  });
};

export {
  getRecordedMatchState,
  isSameScheduledMatch,
  normalizeTeamName,
  removeRecordedFromUpcoming
};
