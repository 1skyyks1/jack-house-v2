const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user/userController');
const PPController = require('../controllers/ppController');
const checkAuth = require('../middleware/authMiddleware');
const { requirePermission } = checkAuth;
const { PERMISSIONS } = require('../config/permissions');

// 创建用户 (需要 users 权限)
router.post('/', checkAuth(), requirePermission(PERMISSIONS.USERS), UserController.createUser);

// 获取所有用户列表 (后台管理用，允许超管、组织者或具有 users 权限者访问)
router.get('/', checkAuth(), requirePermission(PERMISSIONS.USERS, PERMISSIONS.EVENTS, PERMISSIONS.BADGES), UserController.getUsers);

// 根据token获取用户信息
router.get('/info', checkAuth(), UserController.getUserInfo);

// 搜索用户（用于赛事 staff 授权等登录后轻量选择，不返回管理字段）
router.get('/search', checkAuth(), UserController.searchUsers);

// 获取用户已发布的赛事经历与逐局表现
router.get('/:user_id/tournaments', checkAuth.optional, UserController.getUserTournamentExperiences);

// 获取用户在站内精选图包中的最近成绩
router.get('/:user_id/recent-scores', checkAuth.optional, UserController.getUserRecentScores);

// 精选池 PP：双客户端统计和独立 BP List
router.get('/:user_id/pp', PPController.getUserPP);
router.get('/:user_id/pp/best', PPController.getBestPlays);
router.get('/:user_id/pp/history', PPController.getRankHistory);

// 获取单个用户
router.get('/:user_id', checkAuth.optional, UserController.getUserById);

// 更新用户
router.put('/:user_id', checkAuth(), UserController.updateUser);

// 删除用户 (需要 users 权限)
router.delete('/:user_id', checkAuth(), requirePermission(PERMISSIONS.USERS), UserController.deleteUser);

module.exports = router;
