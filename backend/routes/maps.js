const express = require('express');
const router = express.Router();
const MapController = require('../controllers/MapController');

// 获取所有地图
router.get('/', MapController.getAll);

// 获取单个地图
router.get('/:id', MapController.getById);

// 创建地图
router.post('/', MapController.create);

// 更新地图
router.put('/:id', MapController.update);

// 删除地图
router.delete('/:id', MapController.delete);

module.exports = router;