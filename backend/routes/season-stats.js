const express = require('express');
const router = express.Router();
const SeasonStatController = require('../controllers/SeasonStatController');
const SeasonStageController = require('../controllers/SeasonStageController');

router.get('/:seasonId/stages', SeasonStageController.list);
router.post('/:seasonId/stages', express.json(), SeasonStageController.create);
router.put('/stages/:stageId', express.json(), SeasonStageController.update);
router.delete('/stages/:stageId', SeasonStageController.delete);

router.get('/:seasonId/team-score', SeasonStatController.getSeasonTeamScoreStats);
router.get('/:seasonId/map-picks', SeasonStatController.getSeasonMapPickStats);
router.get('/:seasonId/teams/:teamId/compositions', SeasonStatController.getSeasonTeamCompositions);
router.get('/:seasonId/teams/:teamId/hero-stats', SeasonStatController.getSeasonTeamHeroStats);
router.get('/:seasonId/features', SeasonStatController.getSeasonFeatures);
router.get('/:seasonId', SeasonStatController.getSeasonStats);

module.exports = router;
