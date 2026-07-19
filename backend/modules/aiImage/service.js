const crypto = require('crypto');
const fs = require('fs');
const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const { ROLES } = require('../../config/roles');
const User = require('../../models/user/user');
const AiImageJob = require('./models/AiImageJob');
const AiImageRuntime = require('./models/AiImageRuntime');
const upstreamClient = require('./upstreamClient');

const MODEL = 'gpt-image-2';
const ACTIVE_STATUSES = ['submitting', 'pending', 'running'];
const TERMINAL_STATUSES = ['done', 'failed', 'cancelled', 'expired'];
const REMOTE_STATUSES = new Set(['pending', 'running', 'done', 'failed']);
const TECHNICAL_FAILURE_CODES = new Set([
    'rate_limited',
    'upstream_5xx',
    'upstream_error',
    'upstream_network_error',
    'upstream_timeout',
    'no_images',
    'queue_timeout',
    'client_gone',
]);
const DEFAULT_ALLOWED_SIZES = [
    '1024x1024',
    '1k',
    '2k',
    '2048x2048',
    '2048x1152',
    '2560x1440',
    '1440x2560',
    '4k',
    '3840x2160',
    '2160x3840',
];
const MAX_IMAGE_PIXELS = 8_294_400;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 30;
const STALE_SUBMISSION_MS = 2 * 60 * 1000;
const DEFAULT_STALE_CLEANUP_INTERVAL_MS = 60 * 1000;

class AiImageError extends Error {
    constructor(status, code, message, details = null) {
        super(message);
        this.name = 'AiImageError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

const submitJob = async ({ userId, role, body, images = [], mask = null, sourceIp, userAgent }) => {
    if (!upstreamClient.isConfigured()) {
        throw new AiImageError(503, 'service_unavailable', 'AI image service is unavailable');
    }

    const input = validateSubmission({ body, images, mask });
    const referenceMetadata = await Promise.all(images.map(buildFileMetadata));
    const maskMetadata = mask ? await buildFileMetadata(mask) : null;
    const reservation = await reserveJob({
        idempotencyKey: input.idempotencyKey,
        maskMetadata,
        referenceMetadata,
        requestType: input.requestType,
        prompt: input.prompt,
        role,
        size: input.size,
        sourceIp,
        userAgent,
        userId,
    });

    if (reservation.existing) {
        const refreshed = await safelyRefreshJob(reservation.job);
        wakeSynchronizer();
        return serializeJob(reservation.job, refreshed);
    }

    const job = reservation.job;
    try {
        const submitted = input.requestType === 'edit'
            ? await upstreamClient.submitEdit({ images, mask, model: MODEL, prompt: input.prompt, size: input.size })
            : await upstreamClient.submitGeneration({ model: MODEL, prompt: input.prompt, size: input.size });

        if (!submitted?.job_id) {
            throw new upstreamClient.AiImageUpstreamError('AI image service did not return a job id', {
                status: 502,
                code: 'missing_job_id',
                payload: submitted,
            });
        }

        await job.update({
            upstream_job_id: String(submitted.job_id),
            status: normalizeStatus(submitted.status, 'pending'),
            upstream_created_at: parseDate(submitted.created),
            error_code: null,
            error_message: null,
        });
        wakeSynchronizer();
        return serializeJob(job, submitted);
    } catch (error) {
        const normalized = normalizeSubmitError(error);
        await job.update({
            status: 'failed',
            quota_refunded: normalized.refund,
            error_code: normalized.auditCode,
            error_message: normalized.auditMessage,
            finished_at: new Date(),
        });
        throw new AiImageError(normalized.status, normalized.publicCode, normalized.publicMessage);
    }
};

const reserveJob = async ({
    idempotencyKey,
    maskMetadata,
    referenceMetadata,
    requestType,
    prompt,
    role,
    size,
    sourceIp,
    userAgent,
    userId,
}) => sequelize.transaction(async (transaction) => {
    const runtime = await AiImageRuntime.findByPk(1, {
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (!runtime) {
        throw new AiImageError(503, 'migration_required', 'AI image database migration has not been applied');
    }

    const lockedUser = await User.findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (!lockedUser) throw new AiImageError(401, 'user_not_found', 'User was not found');

    await cleanupStaleSubmissions({ transaction });

    const existing = await AiImageJob.findOne({
        where: { user_id: userId, idempotency_key: idempotencyKey },
        transaction,
    });
    if (existing) return { existing: true, job: existing };

    const activeForUser = await AiImageJob.count({
        where: { user_id: userId, status: { [Op.in]: ACTIVE_STATUSES } },
        transaction,
    });
    if (activeForUser > 0) {
        throw new AiImageError(409, 'active_job_exists', 'Wait for your current image job to finish');
    }

    const globalActive = await AiImageJob.count({
        where: { status: { [Op.in]: ACTIVE_STATUSES } },
        transaction,
    });
    if (globalActive >= getGlobalConcurrency()) {
        throw new AiImageError(429, 'global_concurrency_limit', 'The image service is busy; try again shortly');
    }

    const quotaDate = getQuotaDate();
    const effectiveRole = Number.isInteger(Number(lockedUser.role)) ? Number(lockedUser.role) : Number(role);
    const dailyLimit = getDailyLimit(effectiveRole);
    if (dailyLimit !== null) {
        const used = await AiImageJob.sum('quota_units', {
            where: {
                user_id: userId,
                quota_date: quotaDate,
                quota_refunded: false,
            },
            transaction,
        });
        if (Number(used || 0) >= dailyLimit) {
            throw new AiImageError(429, 'daily_quota_exhausted', 'Your daily image quota has been used');
        }
    }

    const job = await AiImageJob.create({
        public_id: crypto.randomUUID(),
        user_id: userId,
        idempotency_key: idempotencyKey,
        request_type: requestType,
        prompt,
        model: MODEL,
        size,
        reference_count: referenceMetadata.length,
        reference_metadata: referenceMetadata,
        has_mask: Boolean(maskMetadata),
        mask_metadata: maskMetadata,
        status: 'submitting',
        quota_date: quotaDate,
        quota_units: 1,
        quota_refunded: false,
        source_ip: sourceIp || null,
        user_agent: String(userAgent || '').slice(0, 512) || null,
    }, { transaction });

    return { existing: false, job };
});

const getUserConfig = async ({ userId, role }) => {
    const quotaDate = getQuotaDate();
    const dailyLimit = getDailyLimit(role);
    const [usedRaw, activeJob] = await Promise.all([
        AiImageJob.sum('quota_units', {
            where: {
                user_id: userId,
                quota_date: quotaDate,
                quota_refunded: false,
            },
        }),
        AiImageJob.findOne({
            where: { user_id: userId, status: { [Op.in]: ACTIVE_STATUSES } },
            order: [['created_time', 'DESC']],
        }),
    ]);
    const used = Number(usedRaw || 0);

    return {
        allowedSizes: getAllowedSizes(),
        quota: {
            date: quotaDate,
            limit: dailyLimit,
            remaining: dailyLimit === null ? null : Math.max(0, dailyLimit - used),
            used,
        },
        activeJob: activeJob ? serializeJob(activeJob) : null,
        maxReferences: 10,
        maxPromptLength: toPositiveInt(process.env.AI_IMAGE_MAX_PROMPT_LENGTH, 8000),
    };
};

const listUserJobs = async ({ userId, page = 1, pageSize = DEFAULT_PAGE_SIZE, hydrate = true }) => {
    const pagination = normalizePagination(page, pageSize);
    const result = await AiImageJob.findAndCountAll({
        where: {
            user_id: userId,
            [Op.or]: [
                { created_time: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
                { status: { [Op.in]: ACTIVE_STATUSES } },
            ],
        },
        order: [['created_time', 'DESC']],
        limit: pagination.pageSize,
        offset: (pagination.page - 1) * pagination.pageSize,
    });
    const remoteById = new Map();

    if (hydrate) {
        await mapWithConcurrency(result.rows, 4, async (job) => {
            if (!job.upstream_job_id || isExpired(job)) return;
            const remote = await safelyRefreshJob(job);
            if (remote) remoteById.set(job.public_id, remote);
        });
    }

    return {
        data: result.rows.map((job) => serializeJob(job, remoteById.get(job.public_id))),
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: result.count,
        totalPages: Math.ceil(result.count / pagination.pageSize),
    };
};

const getUserJob = async ({ publicId, userId }) => {
    const job = await AiImageJob.findOne({ where: { public_id: publicId, user_id: userId } });
    if (!job) throw new AiImageError(404, 'job_not_found', 'Image job was not found');
    const remote = job.upstream_job_id && !isExpired(job) ? await safelyRefreshJob(job) : null;
    return serializeJob(job, remote);
};

const getUserJobResult = async ({ index, publicId, userId }) => {
    const job = await AiImageJob.findOne({ where: { public_id: publicId, user_id: userId } });
    if (!job) throw new AiImageError(404, 'job_not_found', 'Image job was not found');
    if (isExpired(job)) throw new AiImageError(410, 'result_expired', 'Image result has expired');

    const resultIndex = Number.parseInt(index, 10);
    if (!Number.isSafeInteger(resultIndex) || resultIndex < 0) {
        throw new AiImageError(404, 'result_unavailable', 'Image result is unavailable');
    }

    const remote = job.upstream_job_id ? await safelyRefreshJob(job) : null;
    const resultUrls = getResultUrls(remote);
    if (!resultUrls[resultIndex]) {
        throw new AiImageError(404, 'result_unavailable', 'Image result is unavailable');
    }

    let file;
    try {
        file = await upstreamClient.getResultFile(resultUrls[resultIndex]);
    } catch (error) {
        console.error(`Failed to proxy AI image result ${job.public_id}:`, error.message);
        throw new AiImageError(502, 'result_unavailable', 'Image result is unavailable');
    }
    return {
        ...file,
        filename: `jack-house-image-${plainIdentifier(publicId)}-${resultIndex + 1}${extensionForContentType(file.contentType)}`,
    };
};

const listAuditJobs = async ({ page = 1, pageSize = DEFAULT_PAGE_SIZE, status, userId }) => {
    const pagination = normalizePagination(page, pageSize);
    const where = {};
    if (status) where.status = String(status);
    if (Number.isSafeInteger(Number(userId)) && Number(userId) > 0) where.user_id = Number(userId);

    const result = await AiImageJob.findAndCountAll({
        where,
        order: [['created_time', 'DESC']],
        limit: pagination.pageSize,
        offset: (pagination.page - 1) * pagination.pageSize,
    });

    const userIds = [...new Set(result.rows.map((job) => Number(job.user_id)).filter(Number.isSafeInteger))];
    const users = userIds.length > 0
        ? await User.findAll({
            where: { user_id: { [Op.in]: userIds } },
            attributes: ['user_id', 'user_name', 'role'],
        })
        : [];
    const usersById = new Map(users.map((user) => [Number(user.user_id), {
        user_id: user.user_id,
        user_name: user.user_name,
        role: user.role,
    }]));

    return {
        data: result.rows.map((job) => ({
            ...serializeJob(job, null, { includeInternal: true }),
            audit: {
                maskMetadata: job.mask_metadata,
                referenceMetadata: job.reference_metadata,
                sourceIp: job.source_ip,
                userAgent: job.user_agent,
            },
            user: usersById.get(Number(job.user_id)) || null,
        })),
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: result.count,
        totalPages: Math.ceil(result.count / pagination.pageSize),
    };
};

const refreshJob = async (job) => {
    if (!job.upstream_job_id) return null;
    const remote = await upstreamClient.getJob(job.upstream_job_id);
    const status = normalizeStatus(remote.status, job.status);
    const patch = {
        status,
        cost_usd: finiteNumber(remote.cost_usd),
        error_code: remote.error_code || null,
        error_message: remote.error_message || null,
        upstream_created_at: parseDate(remote.created_at) || job.upstream_created_at,
        started_at: parseDate(remote.started_at) || job.started_at,
        finished_at: parseDate(remote.finished_at) || (TERMINAL_STATUSES.includes(status) ? job.finished_at || new Date() : null),
        expires_at: parseDate(remote.expires_at) || job.expires_at,
    };
    if (status === 'failed' && TECHNICAL_FAILURE_CODES.has(String(remote.error_code || ''))) {
        patch.quota_refunded = true;
    }
    await job.update(patch);
    return remote;
};

const safelyRefreshJob = async (job) => {
    try {
        return await refreshJob(job);
    } catch (error) {
        if (ACTIVE_STATUSES.includes(job.status)) {
            console.error(`Failed to refresh AI image job ${job.public_id}:`, error.message);
        }
        return null;
    }
};

let lastStaleCleanupAt = 0;
const cleanupStaleSubmissions = ({ now = Date.now(), transaction } = {}) => {
    const staleBefore = new Date(now - STALE_SUBMISSION_MS);
    return AiImageJob.update({
        status: 'failed',
        quota_refunded: true,
        error_code: 'submission_interrupted',
        error_message: 'Submission was interrupted before an upstream job id was recorded',
        finished_at: new Date(),
    }, {
        where: {
            status: 'submitting',
            upstream_job_id: null,
            updated_time: { [Op.lt]: staleBefore },
        },
        transaction,
    });
};

const syncActiveJobs = async () => {
    if (!upstreamClient.isConfigured()) return 0;
    const now = Date.now();
    const staleCleanupIntervalMs = toPositiveInt(
        process.env.AI_IMAGE_STALE_CLEANUP_INTERVAL_MS,
        DEFAULT_STALE_CLEANUP_INTERVAL_MS,
    );
    if (now - lastStaleCleanupAt >= staleCleanupIntervalMs) {
        lastStaleCleanupAt = now;
        await cleanupStaleSubmissions({ now });
    }

    const active = await AiImageJob.findAll({
        where: {
            status: { [Op.in]: ['pending', 'running'] },
            upstream_job_id: { [Op.ne]: null },
        },
        order: [['updated_time', 'ASC']],
        limit: Math.max(8, getGlobalConcurrency() * 2),
    });
    await Promise.all(active.map(safelyRefreshJob));
    return active.filter((job) => ['pending', 'running'].includes(job.status)).length;
};

let syncTimer = null;
let synchronizerStarted = false;
let syncRunning = false;
let syncWakeRequested = false;

const getSynchronizerDelay = (activeCount) => activeCount > 0
    ? toPositiveInt(process.env.AI_IMAGE_SYNC_INTERVAL_MS, 3000)
    : null;

const scheduleSynchronizer = (delayMs) => {
    if (!synchronizerStarted) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(runSynchronizer, delayMs);
    syncTimer.unref?.();
};

const runSynchronizer = async () => {
    syncTimer = null;
    if (!synchronizerStarted) return;
    if (syncRunning) {
        syncWakeRequested = true;
        return;
    }

    syncRunning = true;
    syncWakeRequested = false;
    let activeCount = 0;
    let syncFailed = false;
    try {
        activeCount = await syncActiveJobs();
    } catch (error) {
        syncFailed = true;
        console.error('AI image synchronizer failed:', error);
    } finally {
        syncRunning = false;
        if (!synchronizerStarted) return;
        if (syncWakeRequested) {
            syncWakeRequested = false;
            scheduleSynchronizer(0);
        } else if (syncFailed) {
            scheduleSynchronizer(toPositiveInt(process.env.AI_IMAGE_SYNC_INTERVAL_MS, 3000));
        } else {
            const delayMs = getSynchronizerDelay(activeCount);
            if (delayMs !== null) scheduleSynchronizer(delayMs);
        }
    }
};

const wakeSynchronizer = () => {
    if (!synchronizerStarted) return;
    syncWakeRequested = true;
    if (!syncRunning) scheduleSynchronizer(0);
};

const startSynchronizer = () => {
    if (synchronizerStarted || process.env.AI_IMAGE_SYNC_ENABLED === 'false' || process.env.NODE_ENV === 'test') return;
    synchronizerStarted = true;
    scheduleSynchronizer(0);
};

const stopSynchronizer = () => {
    synchronizerStarted = false;
    syncWakeRequested = false;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = null;
};

const validateSubmission = ({ body = {}, images, mask }) => {
    const prompt = String(body.prompt || '').trim();
    const maxPromptLength = toPositiveInt(process.env.AI_IMAGE_MAX_PROMPT_LENGTH, 8000);
    if (!prompt) throw new AiImageError(400, 'prompt_required', 'Prompt is required');
    if (prompt.length > maxPromptLength) throw new AiImageError(400, 'prompt_too_long', 'Prompt is too long');

    const idempotencyKey = String(body.idempotencyKey || body.idempotency_key || '').trim();
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(idempotencyKey)) {
        throw new AiImageError(400, 'invalid_idempotency_key', 'A valid idempotency key is required');
    }

    const requestType = String(body.requestType || body.request_type || (images.length ? 'edit' : 'generation'));
    if (!['generation', 'edit'].includes(requestType)) {
        throw new AiImageError(400, 'invalid_request_type', 'Request type is invalid');
    }
    if (requestType === 'generation' && (images.length > 0 || mask)) {
        throw new AiImageError(400, 'unexpected_images', 'Text generation cannot include reference images');
    }
    if (requestType === 'edit' && (images.length < 1 || images.length > 10)) {
        throw new AiImageError(400, 'invalid_reference_count', 'Image editing requires 1 to 10 reference images');
    }

    const totalBytes = images.reduce((sum, file) => sum + Number(file.size || 0), Number(mask?.size || 0));
    const maxTotalBytes = toPositiveInt(process.env.AI_IMAGE_MAX_TOTAL_UPLOAD_MB, 64) * 1024 * 1024;
    if (totalBytes > maxTotalBytes) {
        throw new AiImageError(413, 'uploads_too_large', 'Reference images are too large');
    }

    const size = String(body.size || getAllowedSizes()[0]).trim().toLowerCase();
    if (!getAllowedSizes().includes(size)) {
        throw new AiImageError(400, 'invalid_size', 'Image size is not allowed');
    }

    return { idempotencyKey, prompt, requestType, size };
};

const buildFileMetadata = async (file) => ({
    name: String(file.originalname || '').slice(0, 255),
    mimeType: String(file.mimetype || '').slice(0, 128),
    size: Number(file.size || 0),
    sha256: await hashFile(file.path),
});

const hashFile = (path) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
});

const serializeJob = (job, remote = null, { includeInternal = false } = {}) => {
    const plain = job.toJSON ? job.toJSON() : job;
    const resultUrls = getResultUrls(remote);
    const status = normalizeStatus(remote?.status, plain.status);
    const publicJob = {
        id: plain.public_id,
        requestType: plain.request_type,
        prompt: plain.prompt,
        size: plain.size,
        referenceCount: plain.reference_count,
        hasMask: Boolean(plain.has_mask),
        status,
        resultUrls,
        resultExpired: isExpired(plain),
        createdAt: toIso(plain.created_time),
        startedAt: toIso(remote?.started_at || plain.started_at),
        finishedAt: toIso(remote?.finished_at || plain.finished_at),
        expiresAt: toIso(remote?.expires_at || plain.expires_at),
    };
    if (!includeInternal) return publicJob;

    return {
        ...publicJob,
        upstreamJobId: plain.upstream_job_id,
        model: plain.model,
        quotaRefunded: Boolean(plain.quota_refunded),
        errorCode: remote?.error_code || plain.error_code || null,
        errorMessage: remote?.error_message || plain.error_message || null,
    };
};

const normalizeSubmitError = (error) => {
    const status = Number(error?.status) || 502;
    const auditCode = String(error?.code || 'service_error');
    const refund = status === 401 || status === 403 || status === 429 || status >= 500;
    const publicStatus = status === 400 ? 400 : (status === 429 ? 429 : 502);
    return {
        auditMessage: String(error?.message || 'AI image request failed').slice(0, 2000),
        auditCode,
        publicCode: status === 429
            ? 'service_busy'
            : status === 400
                ? 'request_rejected'
                : 'service_unavailable',
        publicMessage: status === 429
            ? 'The image service is busy; try again shortly'
            : status === 400
                ? 'The image request was rejected'
                : 'The image service is temporarily unavailable',
        refund,
        status: publicStatus,
    };
};

const getResultUrls = (remote) => Array.isArray(remote?.result_urls)
    ? remote.result_urls.filter(isSafeHttpUrl)
    : [];

const plainIdentifier = (value) => String(value || 'result').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'result';

const extensionForContentType = (contentType) => ({
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
}[contentType] || '.img');

const getDailyLimit = (role) => {
    const numericRole = Number(role);
    if (numericRole === ROLES.ADMIN) return null;
    if (numericRole === ROLES.ORG) return toPositiveInt(process.env.AI_IMAGE_DAILY_LIMIT_ORG, 30);
    return toPositiveInt(process.env.AI_IMAGE_DAILY_LIMIT_USER, 10);
};

const getAllowedSizes = () => {
    const sizes = String(process.env.AI_IMAGE_ALLOWED_SIZES || '')
        .split(',')
        .map((size) => size.trim().toLowerCase())
        .filter(isSupportedSizeToken);
    return sizes.length ? [...new Set(sizes)] : DEFAULT_ALLOWED_SIZES;
};

const isSupportedSizeToken = (size) => {
    if (/^[124]k$/.test(size)) return true;
    const match = /^(\d{2,5})x(\d{2,5})$/.exec(size);
    if (!match) return false;
    return Number(match[1]) * Number(match[2]) <= MAX_IMAGE_PIXELS;
};

const getGlobalConcurrency = () => Math.min(4, toPositiveInt(process.env.AI_IMAGE_GLOBAL_CONCURRENCY, 4));

const getQuotaDate = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: process.env.AI_IMAGE_QUOTA_TIMEZONE || 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const normalizePagination = (page, pageSize) => ({
    page: Math.max(1, Number.parseInt(page, 10) || 1),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE)),
});

const normalizeStatus = (value, fallback = 'pending') => {
    const status = String(value || '').toLowerCase();
    return REMOTE_STATUSES.has(status) ? status : fallback;
};

const parseDate = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const toIso = (value) => {
    const date = parseDate(value);
    return date ? date.toISOString() : null;
};

const finiteNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const isSafeHttpUrl = (value) => {
    if (typeof value !== 'string') return false;
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch (error) {
        return false;
    }
};

const isExpired = (job) => {
    if (job.expires_at) return new Date(job.expires_at).getTime() <= Date.now();
    return new Date(job.created_time).getTime() <= Date.now() - 24 * 60 * 60 * 1000;
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (index < items.length) {
            const current = index;
            index += 1;
            await mapper(items[current], current);
        }
    });
    await Promise.all(workers);
};

const toPositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

module.exports = {
    ACTIVE_STATUSES,
    AiImageError,
    getAllowedSizes,
    cleanupStaleSubmissions,
    getDailyLimit,
    getQuotaDate,
    getSynchronizerDelay,
    getUserConfig,
    getUserJob,
    getUserJobResult,
    listAuditJobs,
    listUserJobs,
    refreshJob,
    serializeJob,
    startSynchronizer,
    stopSynchronizer,
    submitJob,
    syncActiveJobs,
    validateSubmission,
};
