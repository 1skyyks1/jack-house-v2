const express = require('express');
const router = express.Router();
const NoticeController = require('../controllers/noticeController');
const checkAuth = require('../middleware/authMiddleware');
const { requirePermission } = checkAuth;
const { PERMISSIONS } = require('../config/permissions');

// 获取当前最新启用的通知（公开接口，免认证）
router.get('/active', NoticeController.getActiveNotice);

// 获取通知列表（后台管理）
router.get('/', checkAuth(), requirePermission(PERMISSIONS.ANNOUNCEMENT), NoticeController.getAllNotices);

// 创建通知（后台管理）
router.post('/', checkAuth(), requirePermission(PERMISSIONS.ANNOUNCEMENT), NoticeController.createNotice);

// 更新通知（后台管理）
router.put('/:id', checkAuth(), requirePermission(PERMISSIONS.ANNOUNCEMENT), NoticeController.updateNotice);

// 删除通知（后台管理）
router.delete('/:id', checkAuth(), requirePermission(PERMISSIONS.ANNOUNCEMENT), NoticeController.deleteNotice);

module.exports = router;
