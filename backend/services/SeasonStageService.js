const Match = require('../models/Match');
const SeasonStage = require('../models/SeasonStage');

const compareMatches = (left, right) => {
  const dateCompare = String(left.matchDate || '').localeCompare(String(right.matchDate || ''));
  if (dateCompare !== 0) return dateCompare;
  return Number(left.id) - Number(right.id);
};

const buildStageRanges = (matchesInput, stagesInput) => {
  const matches = [...(matchesInput || [])].sort(compareMatches);
  const matchIndexById = new Map(matches.map((match, index) => [Number(match.id), index]));

  const stages = (stagesInput || [])
    .map(stage => {
      const startMatchId = stage.startMatchId === null || stage.startMatchId === undefined
        ? null
        : Number(stage.startMatchId);
      return {
        ...stage,
        startMatchId,
        startIndex: startMatchId === null ? 0 : matchIndexById.get(startMatchId)
      };
    })
    .filter(stage => Number.isInteger(stage.startIndex))
    .sort((left, right) => left.startIndex - right.startIndex || Number(left.id) - Number(right.id));

  return stages.map((stage, index) => {
    const nextStage = stages[index + 1];
    const endExclusive = nextStage ? nextStage.startIndex : matches.length;
    const stageMatches = matches.slice(stage.startIndex, endExclusive);
    return {
      ...stage,
      startMatch: matches[stage.startIndex] || null,
      endMatch: stageMatches[stageMatches.length - 1] || null,
      matchIds: stageMatches.map(match => Number(match.id)),
      matchCount: stageMatches.length,
      isCurrent: index === stages.length - 1
    };
  });
};

const listSeasonStageRanges = async (seasonId) => {
  const [matches, stages] = await Promise.all([
    Match.findAll({
      where: { seasonId },
      order: [['matchDate', 'ASC'], ['id', 'ASC']],
      raw: true
    }),
    SeasonStage.findAll({ where: { seasonId }, raw: true })
  ]);
  return buildStageRanges(matches, stages);
};

const resolveStageRange = async (seasonId, stageId) => {
  const ranges = await listSeasonStageRanges(seasonId);
  return ranges.find(stage => Number(stage.id) === Number(stageId)) || null;
};

module.exports = {
  buildStageRanges,
  listSeasonStageRanges,
  resolveStageRange
};
