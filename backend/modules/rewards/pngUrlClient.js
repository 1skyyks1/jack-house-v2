const fetch = require('node-fetch');

const DEFAULT_API_BASE_URL = 'https://pngurl.com/api/v1';
const DEFAULT_STRATEGY_ID = 3;
const DEFAULT_TOKEN_TTL_SECONDS = 300;

function createHttpError(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function getPositiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfig() {
    const permanentToken = String(process.env.PNG_URL_API_TOKEN || '').trim();
    if (!permanentToken) {
        throw createHttpError('PNGURL image upload is not configured', 503, 'pngurl_not_configured');
    }

    return {
        apiBaseUrl: String(process.env.PNG_URL_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, ''),
        permanentToken,
        strategyId: getPositiveInteger(process.env.PNG_URL_REWARD_STRATEGY_ID, DEFAULT_STRATEGY_ID),
        tokenTtlSeconds: getPositiveInteger(process.env.PNG_URL_TEMP_TOKEN_TTL_SECONDS, DEFAULT_TOKEN_TTL_SECONDS),
    };
}

async function createRewardImageUploadGrant({ fetchImpl = fetch } = {}) {
    const config = getConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetchImpl(`${config.apiBaseUrl}/images/tokens`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${config.permanentToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ num: 1, seconds: config.tokenTtlSeconds }),
            signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        const temporaryToken = payload?.data?.tokens?.[0];

        if (!response.ok || !payload?.status || !temporaryToken?.token) {
            throw createHttpError(
                payload?.message || 'PNGURL temporary token request failed',
                502,
                'pngurl_token_failed',
            );
        }

        return {
            uploadUrl: `${config.apiBaseUrl}/upload`,
            token: temporaryToken.token,
            expiresAt: temporaryToken.expired_at || null,
            strategyId: config.strategyId,
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            throw createHttpError('PNGURL temporary token request timed out', 504, 'pngurl_timeout');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    createRewardImageUploadGrant,
    getConfig,
};
