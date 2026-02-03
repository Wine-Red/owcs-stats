const express = require('express');
const router = express.Router();
const StatsController = require('../controllers/StatsController');

// 获取选手统计数据
router.get('/player', StatsController.getPlayerStats);

// 获取队伍统计数据
router.get('/team', StatsController.getTeamStats);

// 获取赛季统计数据
router.get('/season', StatsController.getSeasonStats);

// 获取英雄统计数据
router.get('/hero', StatsController.getHeroStats);

// 获取选手对比数据
router.get('/player/compare', StatsController.comparePlayers);

// 获取队伍对比数据
router.get('/team/compare', StatsController.compareTeams);

module.exports = router;