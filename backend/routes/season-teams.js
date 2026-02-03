const express = require('express');
const router = express.Router();
const SeasonTeamController = require('../controllers/SeasonTeamController');
const SeasonTeamPlayerController = require('../controllers/SeasonTeamPlayerController');

// 获取所有赛季-队伍关联
router.get('/', SeasonTeamController.getAll);

// 根据ID获取赛季-队伍关联
router.get('/:id', SeasonTeamController.getById);

// 获取赛季-队伍的选手
router.get('/:seasonTeamId/players', SeasonTeamPlayerController.getPlayersBySeasonTeamId);

// 创建赛季-队伍关联
router.post('/', SeasonTeamController.create);

// 批量创建赛季-队伍关联
router.post('/bulk', SeasonTeamController.bulkCreate);

// 更新赛季-队伍关联
router.put('/:id', SeasonTeamController.update);

// 删除赛季-队伍关联
router.delete('/:id', SeasonTeamController.delete);

module.exports = router;