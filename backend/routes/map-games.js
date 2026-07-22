const express = require('express');
const router = express.Router();
const MapGameController = require('../controllers/MapGameController');

// 导入地图数据
router.post('/import', MapGameController.importMapData);

// 预览地图数据
router.post('/preview', MapGameController.previewMapData);

// 获取地图局编辑上下文
router.get('/:id/edit-context', MapGameController.getEditContext);

// 获取所有地图局
router.get('/', MapGameController.getAll);

// 获取单个地图局
router.get('/:id', MapGameController.getById);

// 更新地图局
router.put('/:id', MapGameController.update);

// 删除地图局
router.delete('/:id', MapGameController.delete);

// 获取地图局的选手数据
router.get('/:id/player-stats', MapGameController.getPlayerStats);

module.exports = router;
