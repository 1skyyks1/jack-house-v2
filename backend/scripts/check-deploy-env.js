require('dotenv').config();

const args = new Set(process.argv.slice(2));
const profileArg = process.argv.find((arg) => arg.startsWith('--profile='));
const profile = profileArg ? profileArg.split('=')[1] : 'v3';

const errors = [];
const warnings = [];

const addError = (message) => errors.push(message);
const addWarning = (message) => warnings.push(message);

const boolEnv = (name) => process.env[name] === 'true';

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

const validateProfile = () => {
    if (profile !== 'v3') {
        addError(`Unsupported deploy profile: ${profile}. Use --profile=v3 or omit --profile.`);
    }
};

const validateRuntime = () => {
    if (profile === 'v3' && process.env.NODE_ENV !== 'production') {
        addWarning('v3 profile is intended for online deployment; set NODE_ENV=production in the process manager');
    }
};

const validateDatabase = () => {
    requireEnv('DB_HOST');
    requireEnv('DB_NAME');
    requireEnv('DB_USER');
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

    if (profile === 'v3') {
        const hasLocalhost = origins.some((origin) => origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173');
        const hasProductionOrigin = origins.some((origin) => !isLocalOrigin(origin));

        if (args.has('--require-local-v3') && !hasLocalhost) {
            addError('v3 profile with --require-local-v3 requires CORS_ORIGIN to include http://localhost:5173 or http://127.0.0.1:5173');
        }

        if (!hasProductionOrigin) {
            addError('v3 profile requires at least one non-local production frontend origin in CORS_ORIGIN');
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

    if (profile === 'v3' && args.has('--require-local-v3')) {
        if (sameSite !== 'none' || !boolEnv('AUTH_COOKIE_SECURE')) {
            addError('v3 profile with --require-local-v3 requires AUTH_COOKIE_SAME_SITE=none and AUTH_COOKIE_SECURE=true for local V3 -> online backend cookie login');
        }
    }
};

const storageScopes = [
    'RICHTEXT',
    'BADGES',
    'EVENT_STAGE_BG',
    'POSTFILES',
];

const validateStorage = () => {
    storageScopes.forEach((scope) => {
        const provider = String(process.env[`${scope}_STORAGE_PROVIDER`] || '').toLowerCase();
        if (provider !== 'github') {
            addError(`${scope}_STORAGE_PROVIDER must be github; runtime uploads no longer support MinIO`);
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

const validateAiImage = () => {
    requireEnv('AI_IMAGE_API_KEY', 'AI_IMAGE_API_KEY is required for the image generation tool');
    const baseUrl = String(process.env.AI_IMAGE_API_BASE_URL || 'https://task-api-1-cn.65535.space').replace(/\/+$/, '');
    if (baseUrl === 'https://img-cn.65535.space') {
        addError('AI_IMAGE_API_BASE_URL must use the native task API; keep img-cn only in AI_IMAGE_LEGACY_API_BASE_URL');
    }
    const concurrency = Number(process.env.AI_IMAGE_GLOBAL_CONCURRENCY || 4);
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) {
        addError('AI_IMAGE_GLOBAL_CONCURRENCY must be an integer from 1 to 4');
    }

    ['AI_IMAGE_DAILY_LIMIT_USER', 'AI_IMAGE_DAILY_LIMIT_ORG'].forEach((name) => {
        const value = Number(process.env[name]);
        if (process.env[name] && (!Number.isSafeInteger(value) || value <= 0)) {
            addError(`${name} must be a positive integer`);
        }
    });

    const sizes = String(process.env.AI_IMAGE_ALLOWED_SIZES || '1k,2k,4k,auto,1:1,4:3,3:4,16:9,9:16')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    const isSupportedSize = (value) => {
        if (/^[124]k$/.test(value)) return true;
        if (/^(?:1:1|4:3|3:4|16:9|9:16)(?:@[124]k)?$/.test(value)) return true;
        if (/^[a-z][a-z0-9_]{1,31}(?:@[124]k)?$/.test(value)) return true;
        const match = /^(\d{2,5})x(\d{2,5})$/.exec(value);
        return Boolean(match) && Number(match[1]) * Number(match[2]) <= 8294400;
    };
    if (!sizes.length || sizes.some((value) => !isSupportedSize(value))) {
        addError('AI_IMAGE_ALLOWED_SIZES contains an unsupported size, ratio, preset, or resolution combination');
    }
};

validateProfile();
validateRuntime();
validateDatabase();
validateJwt();
validateCors();
validateCookies();
validateStorage();
validateUploadLimits();
validateAiImage();

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
    console.log(`AUTH_COOKIE_SAME_SITE: ${String(process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase()}`);
    console.log(`AUTH_COOKIE_SECURE: ${boolEnv('AUTH_COOKIE_SECURE')}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV || '(not set)'}`);
}
