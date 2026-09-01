const jwt = require('jsonwebtoken');
const { getAuthTokenFromRequest } = require('../utils/authCookie');

const attachAnalyticsUser = (req, _res, next) => {
    const token = getAuthTokenFromRequest(req);
    if (token) {
        try {
            req.analyticsUserId = jwt.verify(token, process.env.JWT_SECRET)?.userId;
        } catch {
            req.analyticsUserId = undefined;
        }
    }
    next();
};

module.exports = attachAnalyticsUser;
