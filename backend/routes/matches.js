const express = require('express');
const router = express.Router();
const MatchController = require('../controllers/MatchController');
const { matchDataReadOnly } = require('../middleware/matchDataReadOnly');

// 获取即将到来的比赛 (Proxy to Liquipedia)
router.get('/upcoming', MatchController.getUpcomingMatches);

// 获取所有比赛
router.get('/', MatchController.getAll);

// 从外部API同步比赛数据
router.post('/sync-external', MatchController.syncExternalMatches);

// 导出比赛数据
router.post('/export', MatchController.exportMatches);

// 获取单个比赛
router.get('/:id/data', MatchController.getData);

// 获取单个比赛
router.get('/:id', MatchController.getById);

// 创建比赛
router.post('/', matchDataReadOnly);

// 更新比赛
router.put('/:id', matchDataReadOnly);

// 删除比赛
router.delete('/:id', matchDataReadOnly);

// 获取比赛的地图局
router.get('/:id/map-games', MatchController.getMapGames);

module.exports = router;
