const aiImageService = require('./service');
const { cleanupFiles } = require('./tempFiles');
const { Transform, pipeline } = require('stream');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);

const getUserId = (req) => Number(req.user?.user_id);
const getRole = (req) => Number(req.user?.role || 0);

exports.getConfig = async (req, res) => {
    try {
        const data = await aiImageService.getUserConfig({
            userId: getUserId(req),
            role: getRole(req),
        });
        return res.json({ data });
    } catch (error) {
        return handleError(req, res, error);
    }
};

exports.submit = async (req, res) => {
    const images = Array.isArray(req.files?.images) ? req.files.images : [];
    const mask = Array.isArray(req.files?.mask) ? req.files.mask[0] || null : null;
    const tempFiles = [...images, ...(mask ? [mask] : [])];

    try {
        const data = await aiImageService.submitJob({
            userId: getUserId(req),
            role: getRole(req),
            body: req.body,
            images,
            mask,
            sourceIp: req.ip,
            userAgent: req.get('User-Agent'),
        });
        return res.status(202).json({ data });
    } catch (error) {
        return handleError(req, res, error);
    } finally {
        await cleanupFiles(tempFiles);
    }
};

exports.listMine = async (req, res) => {
    try {
        const result = await aiImageService.listUserJobs({
            userId: getUserId(req),
            page: req.query.page,
            pageSize: req.query.pageSize,
            hydrate: req.query.hydrate !== 'false',
        });
        return res.json(result);
    } catch (error) {
        return handleError(req, res, error);
    }
};

exports.getMine = async (req, res) => {
    try {
        const data = await aiImageService.getUserJob({
            publicId: req.params.jobId,
            userId: getUserId(req),
        });
        return res.json({ data });
    } catch (error) {
        return handleError(req, res, error);
    }
};

exports.getResult = async (req, res) => {
    let result = null;
    try {
        result = await aiImageService.getUserJobResult({
            publicId: req.params.jobId,
            userId: getUserId(req),
            index: req.params.index,
        });
        const headers = {
            'Cache-Control': 'private, no-store',
            'Content-Disposition': `inline; filename="${result.filename}"`,
            'Content-Type': result.contentType,
            'X-Content-Type-Options': 'nosniff',
        };
        if (result.contentLength) headers['Content-Length'] = String(result.contentLength);
        res.set(headers);

        let transferredBytes = 0;
        const sizeLimiter = new Transform({
            transform(chunk, encoding, callback) {
                transferredBytes += chunk.length;
                if (transferredBytes > result.maxBytes) {
                    return callback(new Error('AI image result exceeded the streaming size limit'));
                }
                return callback(null, chunk);
            },
        });
        await pipelineAsync(result.stream, sizeLimiter, res);
        return undefined;
    } catch (error) {
        if (res.headersSent) {
            console.error('AI image result stream failed:', error.message);
            res.destroy(error);
            return undefined;
        }
        return handleError(req, res, error);
    } finally {
        result?.cleanup?.();
    }
};

exports.listAudit = async (req, res) => {
    try {
        const result = await aiImageService.listAuditJobs({
            page: req.query.page,
            pageSize: req.query.pageSize,
            status: req.query.status,
            userId: req.query.userId,
        });
        return res.json(result);
    } catch (error) {
        return handleError(req, res, error);
    }
};

const handleError = (req, res, error) => {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('AI image request failed:', error);
    const code = status >= 500 ? 'service_unavailable' : (error?.code || 'unknown');
    const messageKey = `aiImage.errors.${code}`;
    const translated = req.t(messageKey);
    const message = translated === messageKey
        ? (status >= 500 ? req.t('aiImage.errors.unknown') : error.message)
        : translated;
    return res.status(status).json({
        code,
        message,
    });
};
