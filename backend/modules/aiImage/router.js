const express = require('express');
const rateLimit = require('express-rate-limit');
const { ROLES } = require('../../config/roles');
const { parseSubmission } = require('./upload');
const aiImageController = require('./controller');
const checkAuth = require('../../middleware/authMiddleware');

const router = express.Router();
const submissionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 6,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user.user_id),
    handler: (req, res) => res.status(429).json({
        code: 'submission_rate_limited',
        message: req.t('aiImage.errors.submission_rate_limited'),
    }),
});
router.use(checkAuth());
router.get('/config', aiImageController.getConfig);
router.get('/admin/jobs', checkAuth([ROLES.ADMIN]), aiImageController.listAudit);
router.get('/jobs', aiImageController.listMine);
router.get('/jobs/:jobId/results/:index', aiImageController.getResult);
router.get('/jobs/:jobId', aiImageController.getMine);
router.post('/jobs', submissionLimiter, parseSubmission, aiImageController.submit);

module.exports = router;
