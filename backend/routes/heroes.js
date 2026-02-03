const express = require('express');
const router = express.Router();
const HeroController = require('../controllers/HeroController');

// 获取所有英雄
router.get('/', HeroController.getAll);

// 获取单个英雄
router.get('/:id', HeroController.getById);

// 创建英雄
router.post('/', HeroController.create);

// 更新英雄
router.put('/:id', HeroController.update);

// 删除英雄
router.delete('/:id', HeroController.delete);

module.exports = router;