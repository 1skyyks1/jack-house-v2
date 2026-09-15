const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/dashboardController');
const checkAuth = require('../middleware/authMiddleware');
const { requirePermission } = checkAuth;
const { PERMISSIONS } = require('../config/permissions');

// 获取公开主页统计数据
router.get('/home', DashboardController.userAndPostCount);
router.get('/users/daily', DashboardController.userGrowthDaily);

// 获取核心运营分析数据（需要 dashboard 权限）
router.get('/business', checkAuth(), requirePermission(PERMISSIONS.DASHBOARD), DashboardController.businessAnalytics);

module.exports = router;
