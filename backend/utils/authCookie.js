const crypto = require('crypto');

const DEFAULT_COOKIE_NAME = 'jh_token';
const DEFAULT_CSRF_COOKIE_NAME = 'jh_csrf';
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const getCookieName = () => process.env.AUTH_COOKIE_NAME || DEFAULT_COOKIE_NAME;
const getCsrfCookieName = () => process.env.CSRF_COOKIE_NAME || DEFAULT_CSRF_COOKIE_NAME;
const ALLOWED_SAME_SITE_VALUES = new Set(['lax', 'strict', 'none']);

const isSecureCookie = () => {
    if (process.env.AUTH_COOKIE_SECURE !== undefined) {
        return process.env.AUTH_COOKIE_SECURE === 'true';
    }
    return process.env.NODE_ENV === 'production';
};

const getSameSite = () => {
    const value = String(process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase();
    if (!ALLOWED_SAME_SITE_VALUES.has(value)) {
        throw new Error('AUTH_COOKIE_SAME_SITE must be one of: lax, strict, none');
    }
    return value;
};

const getCookieOptions = () => {
    const secure = isSecureCookie();
    const sameSite = getSameSite();

    if (sameSite === 'none' && !secure) {
        throw new Error('AUTH_COOKIE_SECURE=true is required when AUTH_COOKIE_SAME_SITE=none');
    }

    return {
        httpOnly: true,
        secure,
        sameSite,
        maxAge: Number(process.env.AUTH_COOKIE_MAX_AGE_MS) || DEFAULT_MAX_AGE_MS,
        path: '/',
    };
};

const getCsrfCookieOptions = () => ({
    ...getCookieOptions(),
    httpOnly: false,
});

const parseCookies = (cookieHeader = '') => {
    return cookieHeader.split(';').reduce((cookies, item) => {
        const [rawName, ...rest] = item.trim().split('=');
        if (!rawName || rest.length === 0) {
            return cookies;
        }
        cookies[rawName] = decodeURIComponent(rest.join('='));
        return cookies;
    }, {});
};

const setAuthCookie = (res, token) => {
    res.cookie(getCookieName(), token, getCookieOptions());
    res.cookie(getCsrfCookieName(), crypto.randomBytes(32).toString('hex'), getCsrfCookieOptions());
};

const clearAuthCookie = (res) => {
    res.clearCookie(getCookieName(), {
        ...getCookieOptions(),
        maxAge: undefined,
    });
    res.clearCookie(getCsrfCookieName(), {
        ...getCsrfCookieOptions(),
        maxAge: undefined,
    });
};

const getAuthTokenFromRequest = (req) => {
    const cookies = parseCookies(req.headers.cookie || '');
    return cookies[getCookieName()];
};

module.exports = {
    clearAuthCookie,
    getCookieName,
    getCsrfCookieName,
    getAuthTokenFromRequest,
    getCookieOptions,
    parseCookies,
    setAuthCookie,
};
