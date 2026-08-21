const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const { createRewardImageUploadGrant } = require('../modules/rewards/pngUrlClient');

const originalEnv = {
    PNG_URL_API_BASE_URL: process.env.PNG_URL_API_BASE_URL,
    PNG_URL_API_TOKEN: process.env.PNG_URL_API_TOKEN,
    PNG_URL_REWARD_STRATEGY_ID: process.env.PNG_URL_REWARD_STRATEGY_ID,
    PNG_URL_TEMP_TOKEN_TTL_SECONDS: process.env.PNG_URL_TEMP_TOKEN_TTL_SECONDS,
};

afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

test('creates a short-lived PNGURL upload-only grant without exposing the permanent token', async () => {
    process.env.PNG_URL_API_TOKEN = 'permanent-secret';
    process.env.PNG_URL_API_BASE_URL = 'https://images.example.test/api/v1/';
    process.env.PNG_URL_REWARD_STRATEGY_ID = '3';
    process.env.PNG_URL_TEMP_TOKEN_TTL_SECONDS = '180';
    let request;

    const grant = await createRewardImageUploadGrant({
        fetchImpl: async (url, options) => {
            request = { url, options };
            return {
                ok: true,
                json: async () => ({
                    status: true,
                    data: { tokens: [{ token: 'temporary-token', expired_at: '2026-08-19 15:00:00' }] },
                }),
            };
        },
    });

    assert.equal(request.url, 'https://images.example.test/api/v1/images/tokens');
    assert.equal(request.options.headers.Authorization, 'Bearer permanent-secret');
    assert.deepEqual(JSON.parse(request.options.body), { num: 1, seconds: 180 });
    assert.deepEqual(grant, {
        uploadUrl: 'https://images.example.test/api/v1/upload',
        token: 'temporary-token',
        expiresAt: '2026-08-19 15:00:00',
        strategyId: 3,
    });
    assert.equal(JSON.stringify(grant).includes('permanent-secret'), false);
});

test('fails safely when PNGURL is not configured', async () => {
    delete process.env.PNG_URL_API_TOKEN;

    await assert.rejects(
        () => createRewardImageUploadGrant({ fetchImpl: async () => assert.fail('should not call PNGURL') }),
        (error) => error.status === 503 && error.code === 'pngurl_not_configured',
    );
});

test('maps an upstream token failure to a gateway error', async () => {
    process.env.PNG_URL_API_TOKEN = 'permanent-secret';

    await assert.rejects(
        () => createRewardImageUploadGrant({
            fetchImpl: async () => ({
                ok: false,
                json: async () => ({ status: false, message: 'API disabled' }),
            }),
        }),
        (error) => error.status === 502 && error.code === 'pngurl_token_failed' && error.message === 'API disabled',
    );
});
