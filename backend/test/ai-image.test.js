const assert = require('node:assert/strict');
const { test } = require('node:test');

process.env.AI_IMAGE_API_KEY = 'test-image-key';
process.env.AI_IMAGE_DAILY_LIMIT_USER = '10';
process.env.AI_IMAGE_DAILY_LIMIT_ORG = '30';
process.env.AI_IMAGE_GLOBAL_CONCURRENCY = '4';
process.env.AI_IMAGE_ALLOWED_SIZES = '1024x1024';

const sequelize = require('../config/db');
const User = require('../models/user/user');
const AiImageJob = require('../modules/aiImage/models/AiImageJob');
const AiImageRuntime = require('../modules/aiImage/models/AiImageRuntime');
const service = require('../modules/aiImage/service');
const upstreamClient = require('../modules/aiImage/upstreamClient');

const patchMethod = (t, object, name, implementation) => {
    const original = object[name];
    object[name] = implementation;
    t.after(() => {
        object[name] = original;
    });
};

const mockReservationDatabase = (t, { activeForUser = 0, globalActive = 0, roles = [], used = 0 } = {}) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    let countCall = 0;
    patchMethod(t, sequelize, 'transaction', async (callback) => callback(transaction));
    patchMethod(t, AiImageRuntime, 'findByPk', async () => ({ runtime_id: 1 }));
    patchMethod(t, User, 'findByPk', async () => ({ user_id: 7, roles }));
    patchMethod(t, AiImageJob, 'update', async () => [0]);
    patchMethod(t, AiImageJob, 'findOne', async () => null);
    patchMethod(t, AiImageJob, 'count', async () => {
        countCall += 1;
        return countCall === 1 ? activeForUser : globalActive;
    });
    patchMethod(t, AiImageJob, 'sum', async () => used);
};

const createMockJob = (values) => ({
    ...values,
    async update(patch) {
        Object.assign(this, patch);
        return this;
    },
    toJSON() {
        return { ...this, update: undefined, toJSON: undefined };
    },
});

test('daily limits match user, organizer, and administrator roles', () => {
    assert.equal(service.getDailyLimit({ roles: [] }), 10);
    assert.equal(service.getDailyLimit({ roles: ['organizer'] }), 30);
    assert.equal(service.getDailyLimit({ isSuperAdmin: true, roles: ['admin'] }), null);
});

test('all documented image size presets are enabled by default', (t) => {
    const originalSizes = process.env.AI_IMAGE_ALLOWED_SIZES;
    delete process.env.AI_IMAGE_ALLOWED_SIZES;
    t.after(() => {
        process.env.AI_IMAGE_ALLOWED_SIZES = originalSizes;
    });

    assert.deepEqual(service.getAllowedSizes(), [
        '1k',
        '2k',
        '4k',
        'auto',
        '1:1',
        '4:3',
        '3:4',
        '16:9',
        '9:16',
    ]);
});

test('quota date uses the configured Asia/Shanghai calendar day', () => {
    assert.equal(service.getQuotaDate(new Date('2026-07-18T15:59:59.000Z')), '2026-07-18');
    assert.equal(service.getQuotaDate(new Date('2026-07-18T16:00:00.000Z')), '2026-07-19');
});

test('synchronizer polls while active and fully stops while idle', (t) => {
    const originalActive = process.env.AI_IMAGE_SYNC_INTERVAL_MS;
    process.env.AI_IMAGE_SYNC_INTERVAL_MS = '2500';
    t.after(() => {
        process.env.AI_IMAGE_SYNC_INTERVAL_MS = originalActive;
    });

    assert.equal(service.getSynchronizerDelay(1), 2500);
    assert.equal(service.getSynchronizerDelay(0), null);
});

test('user config exposes model choices without concurrency or retention implementation details', async (t) => {
    patchMethod(t, AiImageJob, 'sum', async () => 2);
    patchMethod(t, AiImageJob, 'findOne', async () => null);

    const config = await service.getUserConfig({ userId: 7, access: { roles: [] } });
    assert.equal(config.quota.used, 2);
    assert.deepEqual(config.allowedModels, ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']);
    assert.equal(config.defaultModel, 'gpt-image-2.5-flare');
    assert.equal(Object.hasOwn(config, 'model'), false);
    assert.equal(Object.hasOwn(config, 'concurrency'), false);
    assert.equal(Object.hasOwn(config, 'imageRetention'), false);
});

test('text generation rejects reference images and edit requires them', () => {
    const base = {
        body: {
            idempotencyKey: '1234567890abcdef',
            prompt: 'a neon city',
            size: '1024x1024',
        },
        mask: null,
    };

    assert.throws(() => service.validateSubmission({
        ...base,
        body: { ...base.body, requestType: 'generation' },
        images: [{ size: 1 }],
    }), (error) => error.code === 'unexpected_images');

    assert.throws(() => service.validateSubmission({
        ...base,
        body: { ...base.body, requestType: 'edit' },
        images: [],
    }), (error) => error.code === 'invalid_reference_count');

    assert.doesNotThrow(() => service.validateSubmission({
        ...base,
        body: { ...base.body, requestType: 'edit' },
        images: Array.from({ length: 16 }, () => ({ size: 1 })),
    }));

    assert.throws(() => service.validateSubmission({
        ...base,
        body: { ...base.body, requestType: 'edit' },
        images: Array.from({ length: 17 }, () => ({ size: 1 })),
    }), (error) => error.code === 'invalid_reference_count');
});

test('all fixed ratios and resolution tiers can be composed by the frontend', () => {
    for (const ratio of ['auto', '1:1', '4:3', '3:4', '16:9', '9:16']) {
        for (const resolution of ['1k', '2k', '4k']) {
            const size = `${ratio}@${resolution}`;
            const validated = service.validateSubmission({
                body: {
                    idempotencyKey: '1234567890abcdef',
                    prompt: 'composed image',
                    requestType: 'generation',
                    size,
                },
                images: [],
                mask: null,
            });

            assert.equal(validated.size, size);
        }
    }
});

test('custom exact pixel sizes are accepted within the image pixel budget', () => {
    const validated = service.validateSubmission({
        body: {
            idempotencyKey: '1234567890abcdef',
            prompt: 'custom image',
            requestType: 'generation',
            size: '1536x1024',
        },
        images: [],
        mask: null,
    });

    assert.equal(validated.size, '1536x1024');
});

test('one active job blocks every role, including administrators', async (t) => {
    mockReservationDatabase(t, { activeForUser: 1, roles: [{ role_code: 'admin', permissions: ['*'] }] });

    await assert.rejects(service.submitJob({
        userId: 7,
        body: {
            idempotencyKey: '1234567890abcdef',
            prompt: 'test',
            requestType: 'generation',
            size: '1024x1024',
        },
    }), (error) => error.code === 'active_job_exists' && error.status === 409);
});

test('shared upstream concurrency is enforced before submission', async (t) => {
    const originalConcurrency = process.env.AI_IMAGE_GLOBAL_CONCURRENCY;
    process.env.AI_IMAGE_GLOBAL_CONCURRENCY = '99';
    t.after(() => {
        process.env.AI_IMAGE_GLOBAL_CONCURRENCY = originalConcurrency;
    });
    mockReservationDatabase(t, { activeForUser: 0, globalActive: 4 });

    await assert.rejects(service.submitJob({
        userId: 7,
        body: {
            idempotencyKey: '1234567890abcdef',
            prompt: 'test',
            requestType: 'generation',
            size: '1024x1024',
        },
    }), (error) => error.code === 'global_concurrency_limit' && error.status === 429);
});

test('organizer quota stops the 31st accepted request', async (t) => {
    mockReservationDatabase(t, { roles: [{ role_code: 'organizer', permissions: ['events'] }], used: 30 });

    await assert.rejects(service.submitJob({
        userId: 7,
        body: {
            idempotencyKey: '1234567890abcdef',
            prompt: 'test',
            requestType: 'generation',
            size: '1024x1024',
        },
    }), (error) => error.code === 'daily_quota_exhausted' && error.status === 429);
});

test('accepted native generation stores the mapping without persisting result URLs', async (t) => {
    mockReservationDatabase(t, { used: 2 });
    let createdJob;
    patchMethod(t, AiImageJob, 'create', async (values) => {
        createdJob = createMockJob({ ai_image_job_id: 1, created_time: new Date(), updated_time: new Date(), ...values });
        return createdJob;
    });
    patchMethod(t, upstreamClient, 'submitGeneration', async (input) => {
        assert.equal(input.idempotencyKey, '1234567890abcdef');
        assert.equal(input.model, 'gpt-image-2.5-flare');
        return {
            id: 'img_123',
            status: 'pending',
            created_at: '2025-07-18T00:00:00.000Z',
            result_urls: ['https://should-not-be-saved.example/image.png'],
        };
    });

    const result = await service.submitJob({
        userId: 7,
        body: {
            idempotencyKey: '1234567890abcdef',
            prompt: 'test',
            requestType: 'generation',
            size: '1024x1024',
        },
        sourceIp: '127.0.0.1',
        userAgent: 'test',
    });

    assert.equal(createdJob.upstream_job_id, 'img_123');
    assert.equal(createdJob.model, 'gpt-image-2.5-flare');
    assert.equal(result.model, 'gpt-image-2.5-flare');
    assert.equal(Object.hasOwn(createdJob, 'result_urls'), false);
    assert.deepEqual(result.resultUrls, ['https://should-not-be-saved.example/image.png']);
    assert.equal(Object.hasOwn(result, 'upstreamJobId'), false);
    assert.equal(Object.hasOwn(result, 'costUsd'), false);
});

test('serialized user jobs expose temporary image URLs without leaking internal fields', () => {
    const job = createMockJob({
        public_id: 'public-1',
        upstream_job_id: 'img_1',
        request_type: 'generation',
        prompt: 'test',
        model: 'gpt-image-2',
        size: '1024x1024',
        reference_count: 0,
        has_mask: false,
        status: 'done',
        quota_refunded: false,
        created_time: new Date(),
    });

    const serialized = service.serializeJob(job, {
        status: 'done',
        result_urls: [
            'https://image.example.test/result.png',
            'javascript:alert(1)',
            'not a url',
        ],
    });

    assert.deepEqual(serialized.resultUrls, ['https://image.example.test/result.png']);
    assert.equal(Object.hasOwn(serialized, 'upstreamJobId'), false);
    assert.equal(serialized.model, 'gpt-image-2');
    assert.equal(Object.hasOwn(serialized, 'costUsd'), false);
    assert.equal(Object.hasOwn(serialized, 'errorMessage'), false);
});

test('administrator audit serialization keeps operational metadata but never exposes cost', () => {
    const job = createMockJob({
        public_id: 'public-1',
        upstream_job_id: 'img_1',
        request_type: 'generation',
        prompt: 'test',
        model: 'gpt-image-2',
        size: '1024x1024',
        reference_count: 0,
        has_mask: false,
        status: 'done',
        quota_refunded: false,
        cost_usd: 0.038,
        created_time: new Date(),
    });

    const serialized = service.serializeJob(job, null, { includeInternal: true });
    assert.equal(serialized.upstreamJobId, 'img_1');
    assert.equal(serialized.model, 'gpt-image-2');
    assert.equal(Object.hasOwn(serialized, 'costUsd'), false);
});

test('image results are fetched server-side only after checking job ownership', async (t) => {
    const job = createMockJob({
        public_id: 'public-1',
        upstream_job_id: 'img_1',
        request_type: 'generation',
        prompt: 'test',
        model: 'gpt-image-2',
        size: '1024x1024',
        reference_count: 0,
        has_mask: false,
        status: 'done',
        quota_refunded: false,
        created_time: new Date(),
    });
    patchMethod(t, AiImageJob, 'findOne', async ({ where }) => (
        where.public_id === 'public-1' && where.user_id === 7 ? job : null
    ));
    patchMethod(t, upstreamClient, 'getJob', async () => ({
        status: 'done',
        result_urls: ['https://image.example.test/result.png'],
    }));
    patchMethod(t, upstreamClient, 'getResultFile', async (url) => {
        assert.equal(url, 'https://image.example.test/result.png');
        return {
            cleanup() {},
            contentLength: 5,
            contentType: 'image/png',
            maxBytes: 1024,
            stream: null,
        };
    });

    const result = await service.getUserJobResult({ index: '0', publicId: 'public-1', userId: 7 });
    assert.equal(result.contentType, 'image/png');
    assert.match(result.filename, /^jack-house-image-public-1-1\.png$/);

    await assert.rejects(
        service.getUserJobResult({ index: '0', publicId: 'public-1', userId: 8 }),
        (error) => error.code === 'job_not_found' && error.status === 404,
    );
});


test('non-superadmin RBAC roles cannot receive unlimited quota', async (t) => {
    mockReservationDatabase(t, { roles: [{ role_code: 'moderator', permissions: ['posts'] }], used: 10 });
    await assert.rejects(service.submitJob({
        userId: 7,
        body: { idempotencyKey: '1234567890abcdef', prompt: 'test', requestType: 'generation', size: '1024x1024' },
    }), (error) => error.code === 'daily_quota_exhausted' && error.status === 429);
});

test('model validation allows only Flare and Sunburst and defaults legacy callers to Flare', (t) => {
    const originalModel = process.env.AI_IMAGE_MODEL;
    t.after(() => {
        if (originalModel === undefined) delete process.env.AI_IMAGE_MODEL;
        else process.env.AI_IMAGE_MODEL = originalModel;
    });
    const body = {
        idempotencyKey: '1234567890abcdef',
        prompt: 'model selection',
        requestType: 'generation',
        size: '1024x1024',
    };
    const validate = (patch = {}) => service.validateSubmission({ body: { ...body, ...patch }, images: [], mask: null });
    delete process.env.AI_IMAGE_MODEL;
    assert.equal(validate().model, 'gpt-image-2.5-flare');
    process.env.AI_IMAGE_MODEL = 'gpt-image-2';
    assert.equal(validate().model, 'gpt-image-2.5-flare');
    for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']) {
        assert.equal(validate({ model }).model, model);
    }
    for (const model of ['gpt-image-2', 'gpt-image-2.5', '', null, ['gpt-image-2.5-flare'], { id: 'gpt-image-2.5-flare' }]) {
        assert.throws(() => validate({ model }), (error) => error.status === 400 && error.code === 'invalid_model');
    }
});

for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']) {
    for (const requestType of ['generation', 'edit']) {
        test(requestType + ' persists and forwards selected model ' + model, async (t) => {
            mockReservationDatabase(t);
            let createdJob;
            patchMethod(t, AiImageJob, 'create', async (values) => {
                createdJob = createMockJob({ ai_image_job_id: 1, created_time: new Date(), ...values });
                return createdJob;
            });
            const images = requestType === 'edit' ? [{
                path: __filename,
                originalname: 'reference.png',
                mimetype: 'image/png',
                size: 1,
            }] : [];
            let submitCalls = 0;
            const submit = async (input) => {
                submitCalls += 1;
                assert.equal(input.model, model);
                if (requestType === 'edit') assert.deepEqual(input.images, images);
                return { id: 'img_selected', status: 'pending' };
            };
            patchMethod(t, upstreamClient, 'submitGeneration', requestType === 'generation' ? submit : async () => assert.fail('Wrong submission mode'));
            patchMethod(t, upstreamClient, 'submitEdit', requestType === 'edit' ? submit : async () => assert.fail('Wrong submission mode'));
            const result = await service.submitJob({
                userId: 7,
                body: { idempotencyKey: '1234567890abcdef', prompt: 'selected model', requestType, size: '1024x1024', model },
                images,
            });
            assert.equal(submitCalls, 1);
            assert.equal(createdJob.model, model);
            assert.equal(result.model, model);
        });
    }
}

test('unsupported models are rejected before reserving quota or submitting upstream', async (t) => {
    patchMethod(t, sequelize, 'transaction', async () => assert.fail('Invalid model reserved quota'));
    patchMethod(t, upstreamClient, 'submitGeneration', async () => assert.fail('Invalid model submitted upstream'));
    await assert.rejects(service.submitJob({
        userId: 7,
        body: { idempotencyKey: '1234567890abcdef', prompt: 'test', requestType: 'generation', size: '1024x1024', model: 'gpt-image-2' },
    }), (error) => error.status === 400 && error.code === 'invalid_model');
});
