const express = require('express');
const router = express.Router();
const EventController = require('../controllers/event/eventController');
const EventStageController = require('../controllers/event/eventStageController');
const EventScoreController = require('../controllers/event/eventScoreController');
const osuEventController = require('../controllers/osu/osuEventController');
const checkAuth = require('../middleware/authMiddleware');
const { ROLES } = require('../config/roles');

const rateLimit = require('express-rate-limit');
const osuLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 80,
    standardHeaders: true,
    legacyHeaders: false,
});
const beatmapsetImportLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
});

// 获取活动列表，isActive=true筛选出正在进行的
router.get('/', EventController.getEvents);

// 获取某活动详情
router.get('/:event_id', EventController.getEventInfo);

// 创建活动
router.post('/', checkAuth([ROLES.ORG, ROLES.ADMIN]), EventController.createEvent);

// 更新活动
router.put('/:event_id', checkAuth([ROLES.ORG, ROLES.ADMIN]), EventController.updateEvent);

// 删除活动
router.delete('/:event_id', checkAuth([ROLES.ADMIN]), EventController.deleteEvent);

// 获取指定活动的项目
router.get('/:event_id/stage', EventStageController.getStages);

// 创建项目
router.post('/stage', checkAuth([ROLES.ORG, ROLES.ADMIN]), EventStageController.createStage);

// 从 osu! beatmapset 读取所有难度，生成待提交的 Stage 草稿
router.get('/stage/import/:beatmapset_id', beatmapsetImportLimiter, checkAuth([ROLES.ORG, ROLES.ADMIN]), EventStageController.importBeatmapset);

// 修改项目
router.put('/stage/:stage_id', checkAuth([ROLES.ORG, ROLES.ADMIN]), EventStageController.updateStage);

// 删除项目
router.delete('/stage/:stage_id', checkAuth([ROLES.ORG, ROLES.ADMIN]), EventStageController.deleteStage);

// 获取指定项目的分数排行榜
router.get('/rank/stage/:stage_id', EventScoreController.getStageScore);

// 获取活动中项目分数总和的总榜
router.get('/rank/event/:event_id', EventScoreController.getEventScore);

// 获取指定用户指定活动中的各项目分数+排名和总分数和排名
router.get('/userRecord/:event_id', checkAuth(), EventScoreController.getUserScore)

// 从osu获取最近一条分数
router.post('/:event_id/score', osuLimiter, checkAuth(), osuEventController.userRecentScore)

module.exports = router
