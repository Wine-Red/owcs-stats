const express = require('express');
const AgentController = require('../controllers/AgentController');

const router = express.Router();

router.get('/status', AgentController.status);
router.post('/chat', AgentController.chat);

module.exports = router;
