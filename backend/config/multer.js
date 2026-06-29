require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const splitEnvList = (value) => {
    return (value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
};

const parseFileSize = (value, fallbackMb) => {
    const parsed = Number(value);
    const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMb;
    return mb * 1024 * 1024;
};

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR); // 文件上传的临时目录
    },
    filename: function (req, file, cb) {
        let originalName = file.originalname;
        originalName = Buffer.from(originalName, 'latin1').toString('utf8');
        const uniqueSuffix = Date.now()/*+ '-' + Math.round(Math.random() * 1E9)*/;
        const fileExtension = path.extname(originalName);
        const fileName = originalName.replace(fileExtension, '');
        cb(null, fileName + '-' + uniqueSuffix + fileExtension);
    }
});

const imageUpload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            return cb(new Error('upload.invalidImageType'), false);
        }
    }
});

const eventStageBgUpload = multer({
    storage: storage,
    limits: { fileSize: parseFileSize(process.env.EVENT_STAGE_BG_MAX_SIZE_MB, 1) },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            return cb(new Error('upload.invalidImageType'), false);
        }
    }
});

const badgeUpload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|svg/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            return cb(new Error('upload.invalidImageType'), false);
        }
    }
});

const richTextImageUpload = multer({
    storage: storage,
    limits: { fileSize: parseFileSize(process.env.RICHTEXT_IMAGE_MAX_SIZE_MB, 5) },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        }

        return cb(new Error('upload.invalidImageType'), false);
    }
});

const postFileUpload = multer({
    storage,
    limits: { fileSize: parseFileSize(process.env.POSTFILE_MAX_SIZE_MB, 20) },
    fileFilter: function (req, file, cb) {
        const defaultExtensions = '.jpg,.jpeg,.png,.gif,.webp,.zip,.rar,.7z,.osz,.osk,.osr,.osu,.pdf,.txt,.md,.json,.csv,.xlsx,.xls';
        const allowedExtensions = splitEnvList(process.env.POSTFILE_ALLOWED_EXTENSIONS || defaultExtensions);
        const allowedMimeTypes = splitEnvList(process.env.POSTFILE_ALLOWED_MIME_TYPES);
        const extname = path.extname(file.originalname).toLowerCase();
        const mimetype = (file.mimetype || '').toLowerCase();

        if (allowedExtensions.length > 0 && !allowedExtensions.includes(extname)) {
            return cb(new Error('postFile.invalidFileType'), false);
        }

        if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(mimetype)) {
            return cb(new Error('postFile.invalidFileType'), false);
        }

        return cb(null, true);
    }
});

module.exports = {
    upload: multer({ storage: storage }),
    imageUpload: imageUpload,
    eventStageBgUpload: eventStageBgUpload,
    badgeUpload: badgeUpload,
    richTextImageUpload: richTextImageUpload,
    postFileUpload: postFileUpload
};
