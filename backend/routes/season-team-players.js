const express = require('express');
const router = express.Router();
const SeasonTeamPlayerController = require('../controllers/SeasonTeamPlayerController');

// 获取所有赛季-队伍-选手关联
router.get('/', SeasonTeamPlayerController.getAll);

// 根据ID获取赛季-队伍-选手关联
router.get('/:id', SeasonTeamPlayerController.getById);

// 获取指定赛季-队伍的所有选手
router.get('/season-team/:seasonTeamId/players', SeasonTeamPlayerController.getPlayersBySeasonTeamId);

// 创建赛季-队伍-选手关联
router.post('/', SeasonTeamPlayerController.create);

// 批量创建赛季-队伍-选手关联
router.post('/bulk', SeasonTeamPlayerController.bulkCreate);

// 更新赛季-队伍-选手关联
router.put('/:id', SeasonTeamPlayerController.update);

// 删除赛季-队伍-选手关联
router.delete('/:id', SeasonTeamPlayerController.delete);

module.exports = router;