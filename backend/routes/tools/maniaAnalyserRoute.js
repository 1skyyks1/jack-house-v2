const express = require('express');
const rateLimit = require('express-rate-limit');
const maniaAnalyserController = require('../../controllers/tools/maniaAnalyserController');
const checkAuth = require('../../middleware/authMiddleware');
const attachAnalyticsUser = require('../../middleware/analyticsUserMiddleware');

const router = express.Router();
const upstreamBeatmapLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user.user_id),
    skip: (req) => maniaAnalyserController.isBeatmapCached(req.params.beatmapId),
    handler: (req, res) => res.status(429).json({ message: req.t('maniaAnalyser.rateLimited') }),
});
const publicBeatmapLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => maniaAnalyserController.isBeatmapCached(req.params.beatmapId),
    handler: (req, res) => res.status(429).json({ message: req.t('maniaAnalyser.rateLimited') }),
});

router.get('/sources/:beatmapId', attachAnalyticsUser, publicBeatmapLimiter, maniaAnalyserController.getPublicBeatmapSource);
router.get('/beatmaps/:beatmapId', checkAuth(), upstreamBeatmapLimiter, maniaAnalyserController.getBeatmapSource);
router.get('/covers/:beatmapsetId', checkAuth(), maniaAnalyserController.getBeatmapCover);

module.exports = router;
