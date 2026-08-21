const assert = require('node:assert/strict');
const { test } = require('node:test');

process.env.BADGES_STORAGE_BUCKET = 'badge-test-bucket';

const storage = require('../services/storage');
const {
    deleteBadgeFile,
    getBadgeImageUrl,
    uploadBadgeFile,
} = require('../services/badgeStorage');

test('legacy MinIO badge records resolve through GitHub without signing', async (t) => {
    let captured;
    t.mock.method(storage, 'getDownloadUrl', async (scope, options) => {
        captured = { scope, options };
        return 'https://cdn.example.test/content/badges/mapper.png';
    });

    const url = await getBadgeImageUrl({
        storage_provider: 'minio',
        object_key: 'mapper.png',
        public_url: 'https://legacy-minio.example.test/badges/mapper.png',
    });

    assert.equal(url, 'https://cdn.example.test/content/badges/mapper.png');
    assert.deepEqual(captured, {
        scope: 'BADGES',
        options: {
            provider: 'github',
            bucket: 'badge-test-bucket',
            objectName: 'mapper.png',
        },
    });
});

test('GitHub badge records reuse their stable public URL', async (t) => {
    const getDownloadUrl = t.mock.method(storage, 'getDownloadUrl', async () => {
        throw new Error('should not generate another URL');
    });

    const url = await getBadgeImageUrl({
        storage_provider: 'github',
        object_key: 'content/badges/badge.webp',
        public_url: 'https://cdn.example.test/content/badges/badge.webp',
    });

    assert.equal(url, 'https://cdn.example.test/content/badges/badge.webp');
    assert.equal(getDownloadUrl.mock.callCount(), 0);
});

test('new badge uploads use PNGURL without changing the legacy storage provider', async (t) => {
    let captured;
    t.mock.method(storage, 'uploadFile', async (scope, options) => {
        captured = { scope, options };
        return { provider: options.provider };
    });

    const uploaded = await uploadBadgeFile({
        objectName: 'badge.webp',
        filePath: '/tmp/badge.webp',
        mimeType: 'image/webp',
    });

    assert.equal(uploaded.provider, 'pngurl');
    assert.deepEqual(captured, {
        scope: 'BADGES',
        options: {
            provider: 'pngurl',
            bucket: 'badge-test-bucket',
            objectName: 'badge.webp',
            filePath: '/tmp/badge.webp',
            mimeType: 'image/webp',
        },
    });
});

test('PNGURL badge records reuse their returned URL and delete through PNGURL', async (t) => {
    const getDownloadUrl = t.mock.method(storage, 'getDownloadUrl', async () => {
        throw new Error('should not generate another URL');
    });
    let deleted;
    t.mock.method(storage, 'deleteFile', async (scope, options) => {
        deleted = { scope, options };
    });

    const badge = {
        storage_provider: 'pngurl',
        object_key: 'pngurl-key',
        public_url: 'https://images.example.test/pngurl-key.webp',
    };

    assert.equal(await getBadgeImageUrl(badge), badge.public_url);
    assert.equal(getDownloadUrl.mock.callCount(), 0);
    await deleteBadgeFile(badge);
    assert.deepEqual(deleted, {
        scope: 'BADGES',
        options: {
            provider: 'pngurl',
            bucket: 'badge-test-bucket',
            objectName: 'pngurl-key',
        },
    });
});

test('badge deletion targets GitHub even for a legacy MinIO row', async (t) => {
    let captured;
    t.mock.method(storage, 'deleteFile', async (scope, options) => {
        captured = { scope, options };
    });

    await deleteBadgeFile({
        storage_provider: 'minio',
        minio_img_name: 'legacy.png',
    });

    assert.deepEqual(captured, {
        scope: 'BADGES',
        options: {
            provider: 'github',
            bucket: 'badge-test-bucket',
            objectName: 'legacy.png',
        },
    });
});
