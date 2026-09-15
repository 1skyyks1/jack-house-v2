const express = require('express');
const router = express.Router();
const postFileController = require('../controllers/post/postFileController');
const postFileCommentController = require('../controllers/post/postFileCommentController');
const checkAuth = require("../middleware/authMiddleware");
const { PERMISSIONS } = require('../config/permissions');

// 获取指定帖子的投稿（条件）
router.get('/', checkAuth(), checkAuth.requirePermission(PERMISSIONS.POST_FILES), postFileController.getFileByPostId);

// 获取指定征稿中指定用户的投稿
router.get('/post/:post_id', checkAuth(), postFileController.getFileByPostAndUser);

// 获取指定用户的所有投稿
router.get('/user/:user_id', postFileController.getFileByUserId);

// 上传投稿
router.post('/upload/:post_id', checkAuth(), postFileController.uploadFile);

// 创建投稿记录（后台兼容入口，普通用户投稿必须走 /upload/:post_id）
router.post('/', checkAuth(), checkAuth.requirePermission(PERMISSIONS.POST_FILES), postFileController.createPostFile);

// 更新投稿备注
router.put('/:file_id', checkAuth(), postFileController.updatePostFile);

// 审核投稿
router.put('/review/:file_id', checkAuth(), checkAuth.requirePermission(PERMISSIONS.POST_FILES), postFileController.reviewPostFile)

// 删除投稿
router.delete('/:file_id', checkAuth(), postFileController.deleteFile);

// 获取url
router.get('/download/:file_id', checkAuth(), checkAuth.requirePermission(PERMISSIONS.POST_FILES), postFileController.getFileUrl);

// 获取指定征稿帖下全部投稿的直链下载清单
router.get('/download-manifest/:post_id', checkAuth(), checkAuth.requirePermission(PERMISSIONS.POST_FILES), postFileController.getPostFilesDownloadManifest);


// 审稿人内部讨论
router.get('/:file_id/comments', checkAuth(), checkAuth.requirePermission(PERMISSIONS.POST_FILES), postFileCommentController.getPostFileComments);
router.post('/:file_id/comments', checkAuth(), checkAuth.requirePermission(PERMISSIONS.POST_FILES), postFileCommentController.createPostFileComment);
router.delete('/comments/:comment_id', checkAuth(), checkAuth.requirePermission(PERMISSIONS.POST_FILES), postFileCommentController.deletePostFileComment);

module.exports = router;
