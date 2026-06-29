require('dotenv').config();

const args = new Set(process.argv.slice(2));
const profileArg = process.argv.find((arg) => arg.startsWith('--profile='));
const profile = profileArg ? profileArg.split('=')[1] : 'default';

const errors = [];
const warnings = [];

const addError = (message) => errors.push(message);
const addWarning = (message) => warnings.push(message);

const boolEnv = (name) => process.env[name] === 'true';
const isDisabled = (name) => process.env[name] === 'false';

const getCorsOrigins = () => (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const isLocalOrigin = (origin) => {
    try {
        const url = new URL(origin);
        return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    } catch {
        return false;
    }
};

const isValidOrigin = (origin) => {
    try {
        const url = new URL(origin);
        return ['http:', 'https:'].includes(url.protocol)
            && url.origin === origin
            && !origin.endsWith('/');
    } catch {
        return false;
    }
};

const requireEnv = (name, message = `${name} is required`) => {
    if (!process.env[name]) {
        addError(message);
    }
};

const validateJwt = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === 'replace-with-a-long-random-secret') {
        addError('JWT_SECRET must be set to a real secret');
        return;
    }

    if (secret.length < 32) {
        addWarning('JWT_SECRET is shorter than 32 characters');
    }
};

const validateCors = () => {
    const origins = getCorsOrigins();
    if (origins.length === 0) {
        addError('CORS_ORIGIN or FRONTEND_URL must be set');
        return;
    }

    origins.forEach((origin) => {
        if (!isValidOrigin(origin)) {
            addError(`Invalid CORS origin: ${origin}. Use protocol + host + optional port only, without path or trailing slash.`);
        }
    });

    if (profile === 'legacy-v3') {
        const hasLocalhost = origins.some((origin) => origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173');
        const hasProductionOrigin = origins.some((origin) => !isLocalOrigin(origin));

        if (!hasLocalhost) {
            addError('legacy-v3 profile requires CORS_ORIGIN to include http://localhost:5173 or http://127.0.0.1:5173 for local V3 testing');
        }

        if (!hasProductionOrigin) {
            addError('legacy-v3 profile requires at least one non-local production frontend origin in CORS_ORIGIN');
        }
    }
};

const validateCookies = () => {
    const sameSite = String(process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase();
    if (!['lax', 'strict', 'none'].includes(sameSite)) {
        addError('AUTH_COOKIE_SAME_SITE must be one of: lax, strict, none');
    }

    if (sameSite === 'none' && !boolEnv('AUTH_COOKIE_SECURE')) {
        addError('AUTH_COOKIE_SECURE=true is required when AUTH_COOKIE_SAME_SITE=none');
    }

    if (profile === 'legacy-v3') {
        if (isDisabled('AUTH_LEGACY_BEARER_ENABLED')) {
            addError('legacy-v3 profile requires AUTH_LEGACY_BEARER_ENABLED=true while the old frontend is still deployed');
        }

        if (sameSite !== 'none' || !boolEnv('AUTH_COOKIE_SECURE')) {
            addError('legacy-v3 profile requires AUTH_COOKIE_SAME_SITE=none and AUTH_COOKIE_SECURE=true for local V3 -> online backend cookie login');
        }
    }
};

const storageScopes = [
    'HOMEIMG',
    'RICHTEXT',
    'BADGES',
    'EVENT_STAGE_BG',
    'POSTFILES',
];

const validateStorage = () => {
    storageScopes.forEach((scope) => {
        const provider = String(process.env[`${scope}_STORAGE_PROVIDER`] || 'minio').toLowerCase();
        if (!['minio', 'github'].includes(provider)) {
            addError(`${scope}_STORAGE_PROVIDER must be minio or github`);
        }

        if (provider === 'github') {
            requireEnv(`${scope}_STORAGE_BUCKET`, `${scope}_STORAGE_BUCKET is required when ${scope}_STORAGE_PROVIDER=github`);
            if (!process.env[`${scope}_GITHUB_STORAGE_TOKEN`] && !process.env.GITHUB_STORAGE_TOKEN) {
                addError(`${scope} GitHub storage requires ${scope}_GITHUB_STORAGE_TOKEN or GITHUB_STORAGE_TOKEN`);
            }
            if (!process.env[`${scope}_GITHUB_STORAGE_OWNER`] && !process.env.GITHUB_STORAGE_OWNER) {
                addWarning(`${scope} GitHub storage owner is using code default 1skyyks1; set GITHUB_STORAGE_OWNER explicitly in production`);
            }
            if (!process.env[`${scope}_GITHUB_STORAGE_REPO`] && !process.env.GITHUB_STORAGE_REPO) {
                addWarning(`${scope} GitHub storage repo is using code default jack-house-img; set GITHUB_STORAGE_REPO explicitly in production`);
            }
        }
    });
};

const validateUploadLimits = () => {
    [
        'RICHTEXT_IMAGE_MAX_SIZE_MB',
        'POSTFILE_MAX_SIZE_MB',
        'POSTFILE_MAX_TOTAL_SIZE_MB',
        'EVENT_STAGE_BG_MAX_SIZE_MB',
    ].forEach((name) => {
        const value = Number(process.env[name]);
        if (process.env[name] && (!Number.isFinite(value) || value <= 0)) {
            addError(`${name} must be a positive number`);
        }
    });

    if (!process.env.POSTFILE_ALLOWED_EXTENSIONS) {
        addWarning('POSTFILE_ALLOWED_EXTENSIONS is not set; backend defaults will be used');
    }
};

validateJwt();
validateCors();
validateCookies();
validateStorage();
validateUploadLimits();

if (warnings.length > 0) {
    console.warn(warnings.map((message) => `Warning: ${message}`).join('\n'));
}

if (errors.length > 0) {
    console.error(errors.map((message) => `Error: ${message}`).join('\n'));
    process.exit(1);
}

console.log(`Deploy environment check passed (${profile} profile).`);

if (args.has('--print-summary')) {
    console.log(`CORS origins: ${getCorsOrigins().join(', ')}`);
    console.log(`AUTH_LEGACY_BEARER_ENABLED: ${process.env.AUTH_LEGACY_BEARER_ENABLED !== 'false'}`);
    console.log(`AUTH_COOKIE_SAME_SITE: ${String(process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase()}`);
    console.log(`AUTH_COOKIE_SECURE: ${boolEnv('AUTH_COOKIE_SECURE')}`);
}
