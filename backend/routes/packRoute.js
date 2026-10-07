const express = require('express');
const router = express.Router();
const PackController = require('../controllers/pack/packController');
const OsuPackController = require('../controllers/osu/osuPackController');
const PackFeedbackController = require('../controllers/pack/packFeedbackController');
const PackScoreController = require('../controllers/pack/packScoreController');
const checkAuth = require('../middleware/authMiddleware');
const { requirePermission } = checkAuth;
const { PERMISSIONS } = require('../config/permissions');
const rateLimit = require('express-rate-limit');

const osuScoreLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 80,
    standardHeaders: true,
    legacyHeaders: false,
});

const osuPackRefreshLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => String(req.user.user_id),
    standardHeaders: true,
    legacyHeaders: false,
});

// 后台查看及处理图包反馈 (需要 packFeedback 权限，需放在 /:pack_id 之前)
router.get('/feedback', checkAuth(), requirePermission(PERMISSIONS.PACK_FEEDBACK), PackFeedbackController.getFeedbackList);
router.patch('/feedback/:feedback_id', checkAuth(), requirePermission(PERMISSIONS.PACK_FEEDBACK), PackFeedbackController.updateFeedbackStatus);

// JHBot protected durable event feed (before /:pack_id).
const { authorize: botEventAuth, createReader: createBotEventReader } = require('../services/botPackEvents');
router.get('/bot/events', botEventAuth, createBotEventReader(require('../config/db')));

// 获取所有包
router.get('/', PackController.getAllPacks);

// 同步近24小时内属于所有精选图包的成绩（需放在 /:pack_id 之前）
router.post('/featured/scores/sync', osuScoreLimiter, checkAuth(), PackScoreController.syncAllFeaturedScores);

// 获取指定难度的永久排行榜
router.get('/:pack_id/beatmap/:beatmap_id/leaderboard', checkAuth.optional, PackScoreController.getBeatmapLeaderboard);

// 将近24小时内属于该图包的成绩同步到整包排行榜
router.post('/:pack_id/scores/sync', osuScoreLimiter, checkAuth(), PackScoreController.syncPackScores);

// 管理员/图包维护员设置推荐
router.patch('/:pack_id/recommendation', checkAuth(), requirePermission(PERMISSIONS.PACK_TAGS, 'pack:manage'), PackController.updateRecommendation);

// 管理员/图包维护员设置叠屋出品
router.patch('/:pack_id/original', checkAuth(), requirePermission(PERMISSIONS.PACK_TAGS, 'pack:manage'), PackController.updateOriginal);

// 管理员设置整包Rank
router.patch('/:pack_id/leaderboard', checkAuth(), requirePermission(PERMISSIONS.PACK_TAGS, 'pack:manage'), PackController.updateLeaderboard);

// 管理员/维护员修改图包类型并清洗标签
router.patch('/:pack_id/type', checkAuth(), requirePermission(PERMISSIONS.PACK_TAGS, 'pack:manage'), PackController.updatePackType);

// 获取指定包信息
router.get('/:pack_id', PackController.getPackById);

// 针对指定图包提交举报或反馈
router.post('/:pack_id/feedback', checkAuth(), PackFeedbackController.createFeedback);

// 删除图包 (仅限超级管理员或具备删除图包权限者)
router.delete('/:pack_id', checkAuth(), requirePermission('pack:delete', PERMISSIONS.ALL), PackController.deletePack);

// 创建图包
router.post('/', checkAuth(), PackController.createPack);

// 从osu获取图包信息
router.get('/osu/:bid', checkAuth(), OsuPackController.beatmapsetDetail);

// 从osu录入图包信息
router.post('/osu/:bid', checkAuth(), OsuPackController.packFromOsu);

// 从osu更新图包信息
router.put('/osu/:bid', checkAuth(), requirePermission(PERMISSIONS.PACK_TAGS, 'pack:manage'), osuPackRefreshLimiter, OsuPackController.updatePackFromOsu);

module.exports = router;
