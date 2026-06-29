const { getCookieName, getCsrfCookieName, isLegacyBearerEnabled, parseCookies } = require('../utils/authCookie');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrfMiddleware = (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (isLegacyBearerEnabled() && authHeader && authHeader.startsWith('Bearer ')) {
        return next();
    }

    const cookies = parseCookies(req.headers.cookie || '');
    if (!cookies[getCookieName()]) {
        return next();
    }

    const csrfCookie = cookies[getCsrfCookieName()];
    const csrfHeader = req.get('X-CSRF-Token');

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        return res.status(403).json({ message: req.t('authMid.csrfDenied') });
    }

    return next();
};

module.exports = csrfMiddleware;
