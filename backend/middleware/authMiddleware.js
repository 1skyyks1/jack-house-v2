const jwt = require('jsonwebtoken');
const { User } = require('../models/index');
const { getAuthTokenFromRequest } = require('../utils/authCookie');

const checkAuth = (roles = []) => {
    return async (req, res, next) => {
        const token = getAuthTokenFromRequest(req);
        if (!token) {
            return res.status(401).json({ message: req.t('authMid.pleaseLogin') });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            const user = await User.findByPk(decoded.userId, {
                attributes: { exclude: ['password'] }
            });

            if (!user) {
                return res.status(401).json({ message: req.t('authMid.userNotFound') });
            }
            if (roles.length > 0) {
                const userRole = user.role;
                if (userRole === undefined || userRole === null || !roles.includes(userRole)) {
                    return res.status(403).json({ message: req.t('authMid.permissionDenied') })
                }
            }
            req.user = user;
            next()
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ message: req.t('auth.pleaseLogin') });
            }
            return res.status(401).json({ message: req.t('auth.pleaseLogin') });
        }
    }
}

checkAuth.optional = async (req, res, next) => {
    const token = getAuthTokenFromRequest(req);
    if (!token) {
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.userId, {
            attributes: { exclude: ['password'] }
        });
        if (user) {
            req.user = user;
        }
    } catch (error) {
        req.user = undefined;
    }

    next();
}

module.exports = checkAuth;
