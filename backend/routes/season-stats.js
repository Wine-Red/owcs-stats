const express = require('express');
const router = express.Router();
const SeasonStatController = require('../controllers/SeasonStatController');

router.get('/:seasonId/stage-snapshots', SeasonStatController.listStageSnapshots);
router.post('/:seasonId/stage-snapshots', express.json(), SeasonStatController.createStageSnapshot);
router.delete('/stage-snapshots/:snapshotId', SeasonStatController.deleteStageSnapshot);
router.get('/:seasonId/team-score', SeasonStatController.getSeasonTeamScoreStats);
router.get('/:seasonId/map-picks', SeasonStatController.getSeasonMapPickStats);
router.get('/:seasonId', SeasonStatController.getSeasonStats);

module.exports = router;
