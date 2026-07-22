const express = require('express');
const router = express.Router();
const StatsController = require('../controllers/StatsController');

router.get('/player/:playerId/profile', StatsController.getPlayerProfile);

// 获取选手统计数据
router.get('/player', StatsController.getPlayerStats);

// 获取队伍统计数据
router.get('/team', StatsController.getTeamStats);

// 获取赛季统计数据
router.get('/season', StatsController.getSeasonStats);

// 获取英雄统计数据
router.get('/hero', StatsController.getHeroStats);

// 获取英雄禁用统计数据
router.get('/hero/ban', StatsController.getHeroBanStats);

// 赛季英雄总览（选用/禁用/胜率/最后一击/大招充能聚合）
router.get('/hero/overview', StatsController.getHeroOverview);

// 某英雄的使用选手数据排名
router.get('/hero/players', StatsController.getHeroPlayers);

// 某选手的赛季英雄数据（按英雄聚合使用时长/最后一击/大招充能）
router.get('/player/heroes', StatsController.getPlayerHeroes);

// 获取选手对比数据
router.get('/player/compare', StatsController.comparePlayers);

// 获取队伍对比数据
router.get('/team/compare', StatsController.compareTeams);

// 获取地图选取统计数据
router.get('/map/pick', StatsController.getMapPickStats);

module.exports = router;
