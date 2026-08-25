const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const pngUrlStorage = require('../services/storage/pngUrlStorage');

const originalEnv = {
    PNG_URL_API_BASE_URL: process.env.PNG_URL_API_BASE_URL,
    PNG_URL_API_TOKEN: process.env.PNG_URL_API_TOKEN,
    PNG_URL_RICHTEXT_STRATEGY_ID: process.env.PNG_URL_RICHTEXT_STRATEGY_ID,
};

afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

test('uses a scope-specific strategy only when explicitly configured', async () => {
    process.env.PNG_URL_API_BASE_URL = 'https://images.example.test/api/v1';
    process.env.PNG_URL_API_TOKEN = 'permanent-secret';
    process.env.PNG_URL_RICHTEXT_STRATEGY_ID = '7';
    let request;

    await pngUrlStorage.uploadFile({
        scope: 'RICHTEXT',
        objectName: 'content-hash.jpg',
        filePath: __filename,
        mimeType: 'image/jpeg',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    status: true,
                    data: {
                        key: 'strategy-key',
                        url: 'https://images.example.test/strategy-key.jpg',
                    },
                }),
            };
        },
    });

    const formParts = request.options.body._streams.filter((part) => typeof part === 'string').join('\n');
    assert.match(formParts, /name="strategy_id"[\s\S]*7/);
});

test('uploads an optimized image publicly and returns PNGURL storage metadata', async () => {
    process.env.PNG_URL_API_BASE_URL = 'https://images.example.test/api/v1/';
    process.env.PNG_URL_API_TOKEN = 'permanent-secret';
    delete process.env.PNG_URL_RICHTEXT_STRATEGY_ID;
    let request;

    const uploaded = await pngUrlStorage.uploadFile({
        scope: 'RICHTEXT',
        objectName: 'content-hash.webp',
        filePath: __filename,
        mimeType: 'image/webp',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    status: true,
                    data: {
                        key: '20260819-private-key',
                        url: 'https://images.example.test/20260819-private-key.webp',
                    },
                }),
            };
        },
    });

    assert.equal(request.url, 'https://images.example.test/api/v1/upload');
    assert.equal(request.options.headers.Authorization, 'Bearer permanent-secret');
    const formParts = request.options.body._streams.filter((part) => typeof part === 'string').join('\n');
    assert.doesNotMatch(formParts, /name="strategy_id"/);
    assert.match(formParts, /name="permission"[\s\S]*1/);
    assert.deepEqual(uploaded, {
        objectName: '20260819-private-key',
        objectKey: '20260819-private-key',
        url: 'https://images.example.test/20260819-private-key.webp',
        publicUrl: 'https://images.example.test/20260819-private-key.webp',
        downloadUrl: 'https://images.example.test/20260819-private-key.webp',
    });
});

test('deletes a PNGURL object by its stored key', async () => {
    process.env.PNG_URL_API_BASE_URL = 'https://images.example.test/api/v1';
    process.env.PNG_URL_API_TOKEN = 'permanent-secret';
    let request;

    await pngUrlStorage.deleteFile({
        scope: 'BADGES',
        objectName: 'key/with spaces',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return {
                ok: true,
                status: 200,
                json: async () => ({ status: true, data: null }),
            };
        },
    });

    assert.equal(request.url, 'https://images.example.test/api/v1/images/key%2Fwith%20spaces');
    assert.equal(request.options.method, 'DELETE');
    assert.equal(request.options.headers.Authorization, 'Bearer permanent-secret');
});

test('requires the permanent PNGURL token', async () => {
    delete process.env.PNG_URL_API_TOKEN;
    await assert.rejects(
        pngUrlStorage.uploadFile({
            scope: 'RICHTEXT',
            objectName: 'image.webp',
            filePath: __filename,
            mimeType: 'image/webp',
            fetchImpl: async () => assert.fail('should not call PNGURL'),
        }),
        /PNG_URL_API_TOKEN is required/,
    );
});
