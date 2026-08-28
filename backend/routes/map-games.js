const express = require('express');
const router = express.Router();
const MapGameController = require('../controllers/MapGameController');
const { matchDataReadOnly } = require('../middleware/matchDataReadOnly');

// 导入地图数据
router.post('/import', matchDataReadOnly);

// 预览地图数据
router.post('/preview', MapGameController.previewMapData);

// 获取地图局编辑上下文
router.get('/:id/edit-context', MapGameController.getEditContext);

// 获取所有地图局
router.get('/', MapGameController.getAll);

// 获取单个地图局
router.get('/:id', MapGameController.getById);

// 更新地图局
router.put('/:id', matchDataReadOnly);

// 删除地图局
router.delete('/:id', matchDataReadOnly);

// 获取地图局的选手数据
router.get('/:id/player-stats', MapGameController.getPlayerStats);

module.exports = router;
