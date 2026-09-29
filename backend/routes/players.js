const express = require('express');
const router = express.Router();
const PlayerController = require('../controllers/PlayerController');
const { handler } = require('../controllers/EntityMergeController');
router.post('/:id/merge/preview', handler('player', false));
router.post('/:id/merge', handler('player', true));

// 获取所有选手
router.get('/', PlayerController.getAll);

// 获取单个选手
router.get('/:id/admin-context', PlayerController.getAdminContext);
router.get('/:id', PlayerController.getById);

// 创建选手
router.post('/', PlayerController.create);

// 更新选手
router.put('/:id', PlayerController.update);

// 删除选手
router.delete('/:id', PlayerController.delete);

module.exports = router;
