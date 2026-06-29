const multer = require('multer');

const TRANSLATION_KEY_PATTERN = /^[a-zA-Z0-9_.-]+$/;

const translateOrFallback = (req, message, fallbackKey = 'upload.failed') => {
    if (!message) {
        return req.t(fallbackKey);
    }

    if (!TRANSLATION_KEY_PATTERN.test(message)) {
        return message;
    }

    const translated = req.t(message);
    return translated === message ? req.t(fallbackKey) : translated;
};

const getMulterMessage = (req, error) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return req.t('upload.fileTooLarge');
        }

        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return req.t('upload.unexpectedFile');
        }
    }

    return translateOrFallback(req, error.message);
};

const getMulterStatus = (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return 413;
    }

    return 400;
};

const handleUpload = (uploadMiddleware) => (req, res, next) => {
    uploadMiddleware(req, res, (error) => {
        if (!error) {
            return next();
        }

        return res.status(getMulterStatus(error)).json({
            message: getMulterMessage(req, error),
        });
    });
};

module.exports = {
    handleUpload,
};
