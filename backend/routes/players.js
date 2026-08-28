const express = require('express');
const router = express.Router();
const PlayerController = require('../controllers/PlayerController');

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
