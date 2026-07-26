const express = require('express');
const StaticExportController = require('../controllers/StaticExportController');

const router = express.Router();

router.get('/snapshot', StaticExportController.getSnapshot);

module.exports = router;
