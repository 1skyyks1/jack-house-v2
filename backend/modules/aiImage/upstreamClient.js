const fs = require('fs');
const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'https://task-api-1-cn.65535.space';
const DEFAULT_LEGACY_BASE_URL = 'https://img-cn.65535.space';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESULT_BYTES = 32 * 1024 * 1024;
const ALLOWED_RESULT_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

class AiImageUpstreamError extends Error {
    constructor(message, { status = 502, code = 'upstream_error', payload = null } = {}) {
        super(message);
        this.name = 'AiImageUpstreamError';
        this.status = status;
        this.code = code;
        this.payload = payload;
    }
}

const getConfig = () => ({
    apiKey: process.env.AI_IMAGE_API_KEY || '',
    baseUrl: String(process.env.AI_IMAGE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    legacyBaseUrl: String(process.env.AI_IMAGE_LEGACY_API_BASE_URL || DEFAULT_LEGACY_BASE_URL).replace(/\/+$/, ''),
    timeoutMs: toPositiveInt(process.env.AI_IMAGE_UPSTREAM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
});

const isConfigured = () => Boolean(getConfig().apiKey);

const submitGeneration = ({ idempotencyKey, model, prompt, size }) => submitTask({
    idempotencyKey,
    input: buildImageInput({ prompt, size }),
    model,
});

const submitEdit = async ({ idempotencyKey, images, mask, model, prompt, size }) => {
    const [imageUrls, maskUrl] = await Promise.all([
        Promise.all(images.map(fileToDataUri)),
        mask ? fileToDataUri(mask) : null,
    ]);
    return submitTask({
        idempotencyKey,
        input: buildImageInput({ imageUrls, maskUrl, prompt, size }),
        model,
    });
};

const submitTask = async ({ idempotencyKey, input, model }) => {
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
            kind: 'image',
            model,
            input,
        }),
    };

    try {
        return await request('/v1/tasks', options);
    } catch (error) {
        if (!['upstream_network_error', 'upstream_timeout'].includes(error?.code)) throw error;
        return request('/v1/tasks', options);
    }
};

const buildImageInput = ({ imageUrls = [], maskUrl = null, prompt, size }) => {
    const dimensions = splitSize(size);
    return {
        prompt,
        ...dimensions,
        n: 1,
        response_format: 'url',
        ...(imageUrls.length ? { image_urls: imageUrls } : {}),
        ...(maskUrl ? { mask: maskUrl } : {}),
    };
};

const splitSize = (value) => {
    const size = String(value || '').trim().toLowerCase();
    if (/^[124]k$/.test(size)) return { resolution: size };
    const combined = /^(.+)@([124]k)$/.exec(size);
    if (combined) return combined[1] === 'auto'
        ? { resolution: combined[2] }
        : { size: combined[1], resolution: combined[2] };
    return size ? { size } : {};
};

const fileToDataUri = async (file) => {
    const bytes = await fs.promises.readFile(file.path);
    return `data:${file.mimetype};base64,${bytes.toString('base64')}`;
};

const getJob = async (jobId) => {
    try {
        return await request(`/v1/tasks/${encodeURIComponent(jobId)}`, { method: 'GET' });
    } catch (error) {
        if (error?.status !== 404) throw error;
    }

    const config = getConfig();
    const response = await request(`/v1/images/async-generations/${encodeURIComponent(jobId)}`, {
        method: 'GET',
    }, { baseUrl: config.legacyBaseUrl });
    if (response && Number(response.code) !== 0 && response.code !== undefined) {
        throw new AiImageUpstreamError(String(response.message || 'Unable to query image job'), {
            status: 502,
            code: String(response.code || 'job_query_failed'),
            payload: response,
        });
    }
    return unwrapEnvelope(response);
};

const getResultFile = async (url) => {
    if (!isHttpUrl(url)) {
        throw new AiImageUpstreamError('Image result is unavailable', {
            status: 404,
            code: 'result_unavailable',
        });
    }

    const config = getConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
        const response = await fetch(url, {
            headers: {
                Accept: 'image/*',
                'User-Agent': 'JackHouse-AI-Image/1.0',
            },
            redirect: 'follow',
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new AiImageUpstreamError('Image result is unavailable', {
                status: response.status === 404 ? 404 : 502,
                code: 'result_unavailable',
            });
        }

        const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!ALLOWED_RESULT_TYPES.has(contentType)) {
            throw new AiImageUpstreamError('Image result is unavailable', {
                status: 502,
                code: 'invalid_result_type',
            });
        }

        const maxBytes = Math.min(
            MAX_RESULT_BYTES,
            toPositiveInt(process.env.AI_IMAGE_RESULT_MAX_MB, 32) * 1024 * 1024,
        );
        const declaredBytes = Number(response.headers.get('content-length') || 0);
        if (declaredBytes > maxBytes) {
            throw new AiImageUpstreamError('Image result is too large', {
                status: 502,
                code: 'result_too_large',
            });
        }

        return {
            cleanup: () => {
                clearTimeout(timeout);
                controller.abort();
            },
            contentLength: declaredBytes > 0 ? declaredBytes : null,
            contentType,
            maxBytes,
            stream: response.body,
        };
    } catch (error) {
        clearTimeout(timeout);
        if (error instanceof AiImageUpstreamError) throw error;
        if (error?.name === 'AbortError') {
            throw new AiImageUpstreamError('Image result timed out', {
                status: 504,
                code: 'result_timeout',
            });
        }
        throw new AiImageUpstreamError('Image result is unavailable', {
            status: 502,
            code: 'result_unavailable',
        });
    }
};

const request = async (path, options, { baseUrl } = {}) => {
    const config = getConfig();
    if (!config.apiKey) {
        throw new AiImageUpstreamError('AI image service is not configured', {
            status: 503,
            code: 'service_not_configured',
        });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
        const response = await fetch(`${baseUrl || config.baseUrl}${path}`, {
            ...options,
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
                'User-Agent': 'JackHouse-AI-Image/1.0',
                ...(options.headers || {}),
            },
            redirect: 'follow',
            signal: controller.signal,
        });
        const payload = await readPayload(response);

        if (!response.ok) {
            const details = resolveErrorDetails(payload, response.status);
            throw new AiImageUpstreamError(details.message, {
                status: response.status,
                code: details.code,
                payload,
            });
        }

        return payload;
    } catch (error) {
        if (error instanceof AiImageUpstreamError) throw error;
        if (error?.name === 'AbortError') {
            throw new AiImageUpstreamError('AI image service timed out', {
                status: 504,
                code: 'upstream_timeout',
            });
        }
        throw new AiImageUpstreamError(error?.message || 'AI image service request failed', {
            status: 502,
            code: 'upstream_network_error',
        });
    } finally {
        clearTimeout(timeout);
    }
};

const readPayload = async (response) => {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        return { message: text.slice(0, 1000) };
    }
};

const unwrapEnvelope = (payload) => {
    if (payload && typeof payload === 'object' && payload.data && !Array.isArray(payload.data)) {
        return payload.data;
    }
    return payload;
};

const resolveErrorDetails = (payload, status) => {
    const nested = payload?.error;
    const message = nested?.message || payload?.message || `AI image service returned ${status}`;
    const code = nested?.code || nested?.type || payload?.code || `upstream_${status}`;
    return { code: String(code), message: String(message) };
};

const isHttpUrl = (value) => {
    if (typeof value !== 'string') return false;
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch (error) {
        return false;
    }
};

function toPositiveInt(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
    AiImageUpstreamError,
    getJob,
    getResultFile,
    isConfigured,
    submitEdit,
    submitGeneration,
};
