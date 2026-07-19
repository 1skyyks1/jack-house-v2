require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const { cleanupFiles } = require('./tempFiles');

const tempDirectory = path.resolve(__dirname, '..', '..', 'uploads', 'ai-image-temp');
fs.mkdirSync(tempDirectory, { recursive: true });

const parseFileSize = (value, fallbackMb) => {
    const parsed = Number(value);
    const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMb;
    return mb * 1024 * 1024;
};

const storage = multer.diskStorage({
    destination: (req, file, callback) => callback(null, tempDirectory),
    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extension}`);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: parseFileSize(process.env.AI_IMAGE_MAX_FILE_SIZE_MB, 20),
        files: 11,
        fields: 12,
    },
    fileFilter: (req, file, callback) => {
        const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
        const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
        const extension = path.extname(file.originalname).toLowerCase();
        const mimeType = String(file.mimetype || '').toLowerCase();

        if (allowedExtensions.has(extension) && allowedMimeTypes.has(mimeType)) {
            return callback(null, true);
        }
        return callback(new Error('aiImage.invalidImageType'), false);
    },
});

const fields = upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'mask', maxCount: 1 },
]);

const getUploadedFiles = (req) => [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat()),
];

const getErrorStatus = (error) => (
    error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
);

const getErrorMessage = (req, error) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') return req.t('upload.fileTooLarge');
        if (error.code === 'LIMIT_UNEXPECTED_FILE') return req.t('upload.unexpectedFile');
    }
    if (error.message === 'aiImage.invalidImageType') return req.t('aiImage.invalidImageType');
    return req.t('upload.failed');
};

const parseSubmission = (req, res, next) => {
    fields(req, res, async (error) => {
        if (!error) return next();
        await cleanupFiles(getUploadedFiles(req));
        return res.status(getErrorStatus(error)).json({
            code: 'invalid_upload',
            message: getErrorMessage(req, error),
        });
    });
};

module.exports = {
    parseSubmission,
    tempDirectory,
};
