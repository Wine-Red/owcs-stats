const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const SeasonStatController = require('../controllers/SeasonStatController');

// Ensure uploads directory exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
  }
});

const upload = multer({ storage: storage });

router.post('/upload', upload.single('file'), SeasonStatController.uploadSeasonStats);
router.post('/ai-preview', upload.single('file'), SeasonStatController.previewAIStats);
router.get('/:seasonId', SeasonStatController.getSeasonStats);

module.exports = router;
