const express = require('express');
const router = express.Router();
const BadgeController = require('../controllers/user/badgeController');
const checkAuth = require('../middleware/authMiddleware');
const { requirePermission } = checkAuth;
const { PERMISSIONS } = require('../config/permissions');

// 获取牌子列表 (需要 badges 权限)
router.get('/', checkAuth(), requirePermission(PERMISSIONS.BADGES), BadgeController.getAllBadges);

// 上传牌子
router.post('/', checkAuth(), requirePermission(PERMISSIONS.BADGES), BadgeController.uploadBadge);

// 添加拥有者
router.post('/:id', checkAuth(), requirePermission(PERMISSIONS.BADGES), BadgeController.addUsersToBadge);

// 删除牌子
router.delete('/:id', checkAuth(), requirePermission(PERMISSIONS.BADGES), BadgeController.deleteBadge);

module.exports = router;