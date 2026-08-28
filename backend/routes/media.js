const express = require('express');
const multer = require('multer');
const MediaController = require('../controllers/MediaController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = new Set(['image/avif', 'image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(String(file.mimetype || '').toLowerCase())) {
      const error = new Error('Only PNG, JPEG, WebP and AVIF images are supported');
      error.statusCode = 415;
      return callback(error);
    }
    return callback(null, true);
  }
});

router.post('/:category/:id', upload.single('file'), MediaController.upload);
router.delete('/:category/:id', MediaController.clear);

module.exports = router;
