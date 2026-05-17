const express = require('express');
const router = express.Router();

// 导入各个模块的路由
const seasonRoutes = require('./seasons');
const teamRoutes = require('./teams');
const playerRoutes = require('./players');
const mapRoutes = require('./maps');
const heroRoutes = require('./heroes');
const matchRoutes = require('./matches');
const mapGameRoutes = require('./map-games');
const playerStatRoutes = require('./player-stats');
const statsRoutes = require('./stats');
const seasonTeamRoutes = require('./season-teams');
const seasonTeamPlayerRoutes = require('./season-team-players');
const seasonStatRoutes = require('./season-stats');
const configRoutes = require('./config');
const aiReportRoutes = require('./ai-reports');

// 注册路由
router.use('/seasons', seasonRoutes);
router.use('/teams', teamRoutes);
router.use('/players', playerRoutes);
router.use('/maps', mapRoutes);
router.use('/heroes', heroRoutes);
router.use('/matches', matchRoutes);
router.use('/map-games', mapGameRoutes);
router.use('/player-stats', playerStatRoutes);
router.use('/stats', statsRoutes);
router.use('/season-teams', seasonTeamRoutes);
router.use('/season-team-players', seasonTeamPlayerRoutes);
router.use('/season-stats', seasonStatRoutes);
router.use('/config', configRoutes);
router.use('/ai-reports', aiReportRoutes);

module.exports = router;