const fs = require('fs/promises');
const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');

const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSIONS_BY_MIME_TYPE = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
};

const parsePositiveInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parseQuality = (value, fallback) => clamp(parsePositiveInteger(value, fallback), 1, 100);

const isEnabled = () => process.env.IMAGE_OPTIMIZE_ENABLED !== 'false';

const shouldConvertToWebp = () => process.env.IMAGE_OPTIMIZE_CONVERT_WEBP !== 'false';

const getOptions = () => ({
    maxWidth: parsePositiveInteger(process.env.IMAGE_OPTIMIZE_MAX_WIDTH, 2560),
    maxHeight: parsePositiveInteger(process.env.IMAGE_OPTIMIZE_MAX_HEIGHT, 2560),
    jpegQuality: parseQuality(process.env.IMAGE_OPTIMIZE_JPEG_QUALITY, 82),
    pngQuality: parseQuality(process.env.IMAGE_OPTIMIZE_PNG_QUALITY, 90),
    webpQuality: parseQuality(process.env.IMAGE_OPTIMIZE_WEBP_QUALITY, 82),
});

const isOptimizableImage = (mimeType) => SUPPORTED_MIME_TYPES.has((mimeType || '').toLowerCase());

const getOutputBuffer = async (filePath, mimeType, { convertToWebp = false } = {}) => {
    const options = getOptions();
    const metadata = await sharp(filePath, { animated: true }).metadata();

    if (metadata.pages && metadata.pages > 1) {
        return null;
    }

    const image = sharp(filePath, { animated: false })
        .rotate()
        .resize({
            width: options.maxWidth,
            height: options.maxHeight,
            fit: 'inside',
            withoutEnlargement: true,
        });

    if (convertToWebp && shouldConvertToWebp()) {
        return {
            buffer: await image.webp({
                quality: options.webpQuality,
                effort: 4,
            }).toBuffer(),
            mimeType: 'image/webp',
        };
    }

    switch ((mimeType || '').toLowerCase()) {
        case 'image/jpeg':
            return {
                buffer: await image.jpeg({
                    quality: options.jpegQuality,
                    mozjpeg: true,
                }).toBuffer(),
                mimeType: 'image/jpeg',
            };
        case 'image/png':
            return {
                buffer: await image.png({
                    compressionLevel: 9,
                    adaptiveFiltering: true,
                    palette: true,
                    quality: options.pngQuality,
                }).toBuffer(),
                mimeType: 'image/png',
            };
        case 'image/webp':
            return {
                buffer: await image.webp({
                    quality: options.webpQuality,
                    effort: 4,
                }).toBuffer(),
                mimeType: 'image/webp',
            };
        default:
            return null;
    }
};

const optimizeImageFile = async (file, options = {}) => {
    if (!file?.path || !isEnabled() || !isOptimizableImage(file.mimetype)) {
        return {
            optimized: false,
            filePath: file?.path,
            mimeType: file?.mimetype || null,
            size: file?.size || 0,
            originalSize: file?.size || 0,
        };
    }

    const originalStat = await fs.stat(file.path);
    const originalSize = originalStat.size;
    const output = await getOutputBuffer(file.path, file.mimetype, options);

    if (!output || (!options.convertToWebp && output.buffer.length >= originalSize)) {
        return {
            optimized: false,
            filePath: file.path,
            mimeType: file.mimetype,
            size: originalSize,
            originalSize,
        };
    }

    const tempPath = `${file.path}.optimized-${process.pid}${path.extname(file.path)}`;

    try {
        await fs.writeFile(tempPath, output.buffer);
        await fs.rename(tempPath, file.path);
    } catch (error) {
        await fs.rm(tempPath, { force: true });
        throw error;
    }

    file.mimetype = output.mimeType;
    file.size = output.buffer.length;

    return {
        optimized: true,
        filePath: file.path,
        mimeType: output.mimeType,
        size: output.buffer.length,
        originalSize,
    };
};

const hashFile = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = require('fs').createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
};

const getExtensionForMimeType = (mimeType, fallbackName = '') => {
    return EXTENSIONS_BY_MIME_TYPE[(mimeType || '').toLowerCase()] || path.extname(fallbackName) || '';
};

const getObjectNameHash = (checksum) => {
    const shortHash = String(checksum || '').slice(0, 16);
    if (!shortHash) {
        throw new Error('checksum is required to build object name');
    }
    return shortHash;
};

const buildContentHashObjectName = (checksum, mimeType, fallbackName = '') => {
    const extension = getExtensionForMimeType(mimeType, fallbackName);
    return `${getObjectNameHash(checksum)}${extension}`;
};

module.exports = {
    buildContentHashObjectName,
    getObjectNameHash,
    hashFile,
    isOptimizableImage,
    optimizeImageFile,
};
