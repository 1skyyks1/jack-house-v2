const express = require('express');
const router = express.Router();
const PackController = require('../controllers/pack/packController');
const OsuPackController = require('../controllers/osu/osuPackController');
const PackFeedbackController = require('../controllers/pack/packFeedbackController');
const checkAuth = require('../middleware/authMiddleware');
const { ROLES } = require("../config/roles");

// 后台查看及处理图包反馈（需放在 /:pack_id 之前）
router.get('/feedback', checkAuth([ROLES.ADMIN]), PackFeedbackController.getFeedbackList)
router.patch('/feedback/:feedback_id', checkAuth([ROLES.ADMIN]), PackFeedbackController.updateFeedbackStatus)

// 获取所有包
router.get('/', PackController.getAllPacks)

// 获取指定包信息
router.get('/:pack_id', PackController.getPackById)

// 针对指定图包提交举报或反馈
router.post('/:pack_id/feedback', checkAuth(), PackFeedbackController.createFeedback)

// 删除图包
router.delete('/:pack_id', checkAuth([ROLES.ADMIN]), PackController.deletePack)

// 创建图包
router.post('/', checkAuth(), PackController.createPack)

// 从osu获取图包信息
router.get('/osu/:bid', checkAuth(), OsuPackController.beatmapsetDetail)

// 从osu录入图包信息
router.post('/osu/:bid', checkAuth(), OsuPackController.packFromOsu)

// 从osu更新图包信息
router.put('/osu/:bid', checkAuth([ROLES.ADMIN]), OsuPackController.updatePackFromOsu)

module.exports = router;
