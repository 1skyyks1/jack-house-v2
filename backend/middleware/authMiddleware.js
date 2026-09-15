const jwt = require('jsonwebtoken');
const { User } = require('../models/index');
const { getAuthTokenFromRequest } = require('../utils/authCookie');
const permissionService = require('../services/permissionService');

const { USER_ROLES_INCLUDE } = permissionService;

/**
 * 身份认证与权限校验中间件
 */
const checkAuth = () => {
    return async (req, res, next) => {
        const token = getAuthTokenFromRequest(req);
        if (!token) {
            return res.status(401).json({ message: req.t ? req.t('authMid.pleaseLogin') : '请先登录' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // 一次性查出用户及其关联角色，避免后续多次查库
            const user = await User.findByPk(decoded.userId, {
                attributes: { exclude: ['password'] },
                include: USER_ROLES_INCLUDE
            });

            if (!user) {
                return res.status(401).json({ message: req.t ? req.t('authMid.userNotFound') : '用户不存在' });
            }

            // 挂载用户信息与 RBAC 权限集合
            const permData = await permissionService.getUserPermissions(user);
            req.user = user;
            req.userPermissions = permData.permissionSet;
            req.userRoles = permData.roles;
            req.isSuperAdmin = permData.isSuperAdmin;

            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ message: req.t ? req.t('authMid.pleaseLogin') : '登录已过期，请重新登录' });
            }
            return res.status(401).json({ message: req.t ? req.t('authMid.pleaseLogin') : '请先登录' });
        }
    };
};

/**
 * 细粒度权限点守卫中间件
 * 必须在 checkAuth 之后或包含在鉴权链中调用
 * 超级管理员拥有 '*' 权限直接放行；其余用户需至少命中给出的其中一个权限点
 *
 * @param  {...string} permissions 所需权限点，如 'badges', 'events:create'
 */
const requirePermission = (...permissions) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: req.t ? req.t('authMid.pleaseLogin') : '请先登录' });
        }

        // 超级管理员直接放行
        if (req.isSuperAdmin || (req.userPermissions && req.userPermissions.has('*'))) {
            return next();
        }

        const hasAny = permissions.some(perm => permissionService.hasPermission(req.userPermissions, perm));
        if (!hasAny) {
            return res.status(403).json({ message: req.t ? req.t('authMid.permissionDenied') : '无权限执行此操作' });
        }

        next();
    };
};

checkAuth.requirePermission = requirePermission;

/**
 * 可选认证中间件：若携带有效 Token 则解析并挂载权限，无 Token 则匿名放行
 */
checkAuth.optional = async (req, res, next) => {
    const token = getAuthTokenFromRequest(req);
    if (!token) {
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.userId, {
            attributes: { exclude: ['password'] },
            include: USER_ROLES_INCLUDE
        });
        if (user) {
            const permData = await permissionService.getUserPermissions(user);
            req.user = user;
            req.userPermissions = permData.permissionSet;
            req.userRoles = permData.roles;
            req.isSuperAdmin = permData.isSuperAdmin;
        }
    } catch (error) {
        req.user = undefined;
        req.userPermissions = undefined;
        req.userRoles = undefined;
        req.isSuperAdmin = false;
    }

    next();
};

module.exports = checkAuth;
module.exports.requirePermission = requirePermission;
