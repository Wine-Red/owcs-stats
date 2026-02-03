const express = require('express');
const router = express.Router();
const PlayerStatController = require('../controllers/PlayerStatController');

// 获取所有选手统计数据
router.get('/', PlayerStatController.getAll);

// 获取单个选手统计数据
router.get('/:id', PlayerStatController.getById);

// 创建选手统计数据
router.post('/', PlayerStatController.create);

// 更新选手统计数据
router.put('/:id', PlayerStatController.update);

// 删除选手统计数据
router.delete('/:id', PlayerStatController.delete);

module.exports = router;