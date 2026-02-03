const express = require('express');
const router = express.Router();
const TeamController = require('../controllers/TeamController');

// 获取所有队伍
router.get('/', TeamController.getAll);

// 获取单个队伍
router.get('/:id', TeamController.getById);

// 创建队伍
router.post('/', TeamController.create);

// 更新队伍
router.put('/:id', TeamController.update);

// 删除队伍
router.delete('/:id', TeamController.delete);

// 获取队伍的选手
router.get('/:id/players', TeamController.getPlayers);

module.exports = router;