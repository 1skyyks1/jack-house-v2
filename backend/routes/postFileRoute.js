const express = require('express');
const router = express.Router();
const postFileController = require('../controllers/post/postFileController');
const checkAuth = require("../middleware/authMiddleware");
const { ROLES } = require("../config/roles");

// 获取指定帖子的投稿（条件）
router.get('/', checkAuth([ROLES.ORG, ROLES.ADMIN]), postFileController.getFileByPostId);

// 获取指定征稿中指定用户的投稿
router.get('/post/:post_id', checkAuth(), postFileController.getFileByPostAndUser);

// 获取指定用户的所有投稿
router.get('/user/:user_id', postFileController.getFileByUserId);

// 上传投稿
router.post('/upload/:post_id', checkAuth(), postFileController.uploadFile);

// 创建投稿
router.post('/', checkAuth(), postFileController.createPostFile);

// 更新投稿备注
router.put('/:file_id', checkAuth(), postFileController.updatePostFile);

// 审核投稿
router.put('/review/:file_id', checkAuth([ROLES.ORG, ROLES.ADMIN]), postFileController.reviewPostFile)

// 删除投稿
router.delete('/:file_id', checkAuth([ROLES.ORG, ROLES.ADMIN]), postFileController.deleteFile);

// 获取url
router.get('/download/:file_id', checkAuth([ROLES.ORG, ROLES.ADMIN]), postFileController.getFileUrl);

module.exports = router;