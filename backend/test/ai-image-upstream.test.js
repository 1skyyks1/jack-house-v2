const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');

process.env.AI_IMAGE_API_KEY = 'test-image-key';

const upstreamClient = require('../modules/aiImage/upstreamClient');

const originalBaseUrl = process.env.AI_IMAGE_API_BASE_URL;
const originalLegacyBaseUrl = process.env.AI_IMAGE_LEGACY_API_BASE_URL;

afterEach(() => {
    restoreEnv('AI_IMAGE_API_BASE_URL', originalBaseUrl);
    restoreEnv('AI_IMAGE_LEGACY_API_BASE_URL', originalLegacyBaseUrl);
});

test('native generation uses the task envelope and forwards idempotency', async (t) => {
    const requests = [];
    const server = await listen(async (req, res) => {
        requests.push({
            body: JSON.parse(await readBody(req)),
            headers: req.headers,
            method: req.method,
            url: req.url,
        });
        sendJson(res, 202, { id: 'img_native', kind: 'image', status: 'pending' });
    });
    t.after(() => server.close());
    process.env.AI_IMAGE_API_BASE_URL = server.url;

    const result = await upstreamClient.submitGeneration({
        idempotencyKey: '1234567890abcdef',
        model: 'gpt-image-2',
        prompt: 'neon city',
        size: '16:9@4k',
    });

    assert.equal(result.id, 'img_native');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].url, '/v1/tasks');
    assert.equal(requests[0].headers['idempotency-key'], '1234567890abcdef');
    assert.deepEqual(requests[0].body, {
        kind: 'image',
        model: 'gpt-image-2',
        input: {
            prompt: 'neon city',
            size: '16:9',
            resolution: '4k',
            n: 1,
            response_format: 'url',
        },
    });
});

test('an ambiguous submit is retried once with the same idempotency key and body', async (t) => {
    const requests = [];
    const server = await listen(async (req, res) => {
        requests.push({
            body: await readBody(req),
            idempotencyKey: req.headers['idempotency-key'],
        });
        if (requests.length === 1) {
            req.socket.destroy();
            return;
        }
        sendJson(res, 202, { id: 'img_recovered', kind: 'image', status: 'pending' });
    });
    t.after(() => server.close());
    process.env.AI_IMAGE_API_BASE_URL = server.url;

    const result = await upstreamClient.submitGeneration({
        idempotencyKey: 'retry1234567890ab',
        model: 'gpt-image-2',
        prompt: 'retry safely',
        size: 'auto@2k',
    });

    assert.equal(result.id, 'img_recovered');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].idempotencyKey, 'retry1234567890ab');
    assert.equal(requests[1].idempotencyKey, requests[0].idempotencyKey);
    assert.equal(requests[1].body, requests[0].body);
    assert.deepEqual(JSON.parse(requests[0].body).input, {
        prompt: 'retry safely',
        resolution: '2k',
        n: 1,
        response_format: 'url',
    });
});

test('native edit encodes references and mask as typed data URIs', async (t) => {
    let payload;
    const server = await listen(async (req, res) => {
        payload = JSON.parse(await readBody(req));
        sendJson(res, 202, { id: 'img_edit', kind: 'image', status: 'pending' });
    });
    t.after(() => server.close());
    process.env.AI_IMAGE_API_BASE_URL = server.url;

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jack-house-ai-image-'));
    const imagePath = path.join(directory, 'image.png');
    const maskPath = path.join(directory, 'mask.png');
    fs.writeFileSync(imagePath, Buffer.from('reference'));
    fs.writeFileSync(maskPath, Buffer.from('mask'));
    t.after(() => fs.rmSync(directory, { force: true, recursive: true }));

    await upstreamClient.submitEdit({
        idempotencyKey: 'abcdef1234567890',
        images: [{ mimetype: 'image/png', path: imagePath }],
        mask: { mimetype: 'image/png', path: maskPath },
        model: 'gpt-image-2',
        prompt: 'replace the sky',
        size: '2k',
    });

    assert.deepEqual(payload.input, {
        prompt: 'replace the sky',
        resolution: '2k',
        n: 1,
        response_format: 'url',
        image_urls: [`data:image/png;base64,${Buffer.from('reference').toString('base64')}`],
        mask: `data:image/png;base64,${Buffer.from('mask').toString('base64')}`,
    });
});

test('old unfinished tasks fall back to the compatibility query endpoint', async (t) => {
    const native = await listen((_req, res) => sendJson(res, 404, {
        error: { message: 'task not found', type: 'Not Found' },
    }));
    const legacyRequests = [];
    const legacy = await listen((req, res) => {
        legacyRequests.push(req.url);
        sendJson(res, 200, {
            code: 0,
            message: 'ok',
            data: { job_id: 'img_old', status: 'running' },
        });
    });
    t.after(() => native.close());
    t.after(() => legacy.close());
    process.env.AI_IMAGE_API_BASE_URL = native.url;
    process.env.AI_IMAGE_LEGACY_API_BASE_URL = legacy.url;

    const task = await upstreamClient.getJob('img_old');

    assert.equal(task.job_id, 'img_old');
    assert.equal(task.status, 'running');
    assert.deepEqual(legacyRequests, ['/v1/images/async-generations/img_old']);
});

const listen = (handler) => new Promise((resolve) => {
    const server = http.createServer((req, res) => {
        Promise.resolve(handler(req, res)).catch((error) => {
            sendJson(res, 500, { message: error.message });
        });
    });
    server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        resolve({
            close: () => new Promise((done) => server.close(done)),
            url: `http://127.0.0.1:${address.port}`,
        });
    });
});

const readBody = (request) => new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
});

const sendJson = (response, status, payload) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
};

const restoreEnv = (name, value) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
};
