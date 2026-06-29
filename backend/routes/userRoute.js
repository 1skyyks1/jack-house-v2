const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user/userController');
const checkAuth = require("../middleware/authMiddleware");
const { ROLES } = require("../config/roles");

// 创建用户
router.post('/', checkAuth([ROLES.ADMIN]), UserController.createUser);

// 获取所有用户
router.get('/', checkAuth([ROLES.ORG, ROLES.ADMIN]), UserController.getUsers);

// 根据token获取用户信息
router.get('/info', checkAuth(), UserController.getUserInfo)

// 搜索用户（用于赛事 staff 授权等登录后轻量选择，不返回管理字段）
router.get('/search', checkAuth(), UserController.searchUsers);

// 获取单个用户
router.get('/:user_id', checkAuth.optional, UserController.getUserById);

// 更新用户
router.put('/:user_id', checkAuth(), UserController.updateUser);

// 删除用户
router.delete('/:user_id', checkAuth([ROLES.ADMIN]), UserController.deleteUser);

module.exports = router;
