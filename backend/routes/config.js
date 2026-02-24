const express = require('express');
const router = express.Router();
const ConfigController = require('../controllers/ConfigController');

router.get('/', ConfigController.getAllConfigs);
router.get('/:key', ConfigController.getConfig);
router.post('/', ConfigController.updateConfig);

module.exports = router;
