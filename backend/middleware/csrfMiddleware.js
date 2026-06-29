const { getCookieName, getCsrfCookieName, parseCookies } = require('../utils/authCookie');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/auth/login', '/auth/register']);

const csrfMiddleware = (req, res, next) => {
    if (SAFE_METHODS.has(req.method) || EXEMPT_PATHS.has(req.path)) {
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
