const express = require('express');
const router = express.Router();
const TagController = require('../controllers/pack/tagController');
const checkAuth = require('../middleware/authMiddleware');
const { ROLES } = require("../config/roles");

// 获取所有tags
router.get('/', TagController.getAllTags)

// 管理标签主数据
router.get('/admin', checkAuth([ROLES.ADMIN]), TagController.getAdminTags)
router.post('/admin', checkAuth([ROLES.ADMIN]), TagController.createTag)
router.patch('/admin/:tag_id', checkAuth([ROLES.ADMIN]), TagController.updateTag)
router.delete('/admin/:tag_id', checkAuth([ROLES.ADMIN]), TagController.deleteTag)

// 更新tags
router.put('/:pack_id', checkAuth([ROLES.ADMIN]), TagController.updatePackTags)

// 删除tags
router.post('/:pack_id', checkAuth([ROLES.ADMIN]), TagController.removeTagsFromPack)

module.exports = router;
