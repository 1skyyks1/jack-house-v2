const express = require('express');
const router = express.Router();
const TagController = require('../controllers/pack/tagController');
const checkAuth = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

// 获取所有tags
router.get('/', TagController.getAllTags)

// 管理标签主数据
router.get('/admin', checkAuth(), checkAuth.requirePermission(PERMISSIONS.PACK_TAGS), TagController.getAdminTags)
router.post('/admin', checkAuth(), checkAuth.requirePermission(PERMISSIONS.PACK_TAGS), TagController.createTag)
router.patch('/admin/:tag_id', checkAuth(), checkAuth.requirePermission(PERMISSIONS.PACK_TAGS), TagController.updateTag)
router.delete('/admin/:tag_id', checkAuth(), checkAuth.requirePermission(PERMISSIONS.PACK_TAGS), TagController.deleteTag)

// 更新tags
router.put('/:pack_id', checkAuth(), checkAuth.requirePermission(PERMISSIONS.PACK_TAGS), TagController.updatePackTags)

// 删除tags
router.post('/:pack_id', checkAuth(), checkAuth.requirePermission(PERMISSIONS.PACK_TAGS), TagController.removeTagsFromPack)

module.exports = router;
