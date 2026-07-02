const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/dashboardController')

// 获取主页数据
router.get('/home', DashboardController.userAndPostCount)
router.get('/users/daily', DashboardController.userGrowthDaily)

module.exports = router;
