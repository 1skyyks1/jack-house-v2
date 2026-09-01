const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/dashboardController')
const checkAuth = require('../middleware/authMiddleware');
const { ROLES } = require('../config/roles');

// 获取主页数据
router.get('/home', DashboardController.userAndPostCount)
router.get('/users/daily', DashboardController.userGrowthDaily)
router.get('/business', checkAuth([ROLES.ADMIN]), DashboardController.businessAnalytics)

module.exports = router;
