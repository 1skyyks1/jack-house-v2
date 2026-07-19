const assert = require('node:assert/strict');
const test = require('node:test');

const storage = require('../services/storage');

test('runtime uploads reject the MinIO provider', async () => {
    await assert.rejects(
        storage.uploadFile('POSTFILES', {
            provider: 'minio',
            bucket: 'postfiles',
            objectName: 'example.txt',
            filePath: '/tmp/example.txt',
        }),
        /Uploads are only supported by GitHub storage/
    );
});

test('storage scopes do not silently default to MinIO', () => {
    const scope = 'UNCONFIGURED_STORAGE_TEST';
    const envName = `${scope}_STORAGE_PROVIDER`;
    const original = process.env[envName];
    delete process.env[envName];

    try {
        assert.throws(
            () => storage.getProviderName(scope),
            new RegExp(`${envName} is required`)
        );
    } finally {
        if (original === undefined) {
            delete process.env[envName];
        } else {
            process.env[envName] = original;
        }
    }
});
