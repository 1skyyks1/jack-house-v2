const express = require('express');
const router = express.Router();
const checkAuth = require('../middleware/authMiddleware');

/**
 * 获取当前登录用户的后台页面权限点及角色列表
 * 权限与角色均来自 RBAC 关联表。
 */
router.get('/', checkAuth(), (req, res) => {
    const adminPermissions = req.userPermissions ? Array.from(req.userPermissions) : [];
    const roles = req.userRoles || [];

    res.json({
        roles,
        adminPermissions
    });
});

module.exports = router;
