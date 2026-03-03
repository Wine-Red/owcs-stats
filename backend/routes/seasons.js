const express = require('express');
const router = express.Router();
const SeasonController = require('../controllers/SeasonController');
const SeasonTeamController = require('../controllers/SeasonTeamController');

// 获取所有赛季
router.get('/', SeasonController.getAll);

// 获取单个赛季
router.get('/:id', SeasonController.getById);

// 检查删除赛季前的影响
router.get('/:id/pre-delete-check', SeasonController.preDeleteCheck);

// 获取赛季的队伍
router.get('/:seasonId/teams', SeasonTeamController.getTeamsBySeasonId);

// 创建赛季
router.post('/', SeasonController.create);

// 更新赛季
router.put('/:id', SeasonController.update);

// 删除赛季
router.delete('/:id', SeasonController.delete);

module.exports = router;