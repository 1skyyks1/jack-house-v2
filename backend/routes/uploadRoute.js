const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const checkAuth = require('../middleware/authMiddleware');

router.post('/rich-text/image', checkAuth(), uploadController.uploadRichTextImage);
router.get('/rich-text/image/:objectName', uploadController.getRichTextImage);

module.exports = router;
