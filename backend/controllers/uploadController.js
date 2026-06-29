const fs = require('fs');
const { richTextImageUpload } = require('../config/multer');
const { handleUpload } = require('../middleware/uploadErrorHandler');
const storage = require('../services/storage');
const { recordUploadedRichTextAsset } = require('../services/richTextAssetService');
const { buildContentHashObjectName, hashFile, optimizeImageFile } = require('../utils/imageOptimizer');

const RICHTEXT_STORAGE_SCOPE = 'RICHTEXT';

const getRichTextBucket = () => storage.getBucketName(
    RICHTEXT_STORAGE_SCOPE,
    ['MINIO_RICHTEXT_BUCKET', 'MINIO_HOMEIMG_BUCKET'],
    storage.getProviderName(RICHTEXT_STORAGE_SCOPE) === 'github' ? 'rich-text' : null
);

const getBackendPublicUrl = (req) => {
    return process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
};

const handleRichTextImageUpload = handleUpload(richTextImageUpload.single('file'));

exports.uploadRichTextImage = [
    handleRichTextImageUpload,
    async (req, res) => {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: req.t('upload.noFile') });
        }

        const bucket = getRichTextBucket();
        if (!bucket) {
            fs.unlinkSync(file.path);
            return res.status(500).json({ message: req.t('upload.bucketMissing') });
        }

        const removeTempFile = () => {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        };

        try {
            const optimized = await optimizeImageFile(file, { convertToWebp: true });
            const checksum = await hashFile(file.path);
            const objectName = buildContentHashObjectName(checksum, optimized.mimeType, file.filename);
            const uploaded = await storage.uploadFile(RICHTEXT_STORAGE_SCOPE, {
                bucket,
                objectName,
                filePath: file.path,
                mimeType: optimized.mimeType,
                size: optimized.size,
            });

            const url = uploaded.publicUrl || `${getBackendPublicUrl(req)}/upload/rich-text/image/${encodeURIComponent(uploaded.objectName)}`;
            await recordUploadedRichTextAsset({
                user_id: req.user.user_id,
                storage_provider: uploaded.provider,
                object_key: uploaded.objectKey,
                public_url: uploaded.publicUrl || url,
                download_url: uploaded.downloadUrl || url,
                mime_type: uploaded.mimeType,
                size: optimized.size,
                checksum,
            });

            removeTempFile();
            res.status(201).json({
                data: {
                    url,
                    storage_provider: uploaded.provider,
                    object_key: uploaded.objectKey,
                    public_url: uploaded.publicUrl,
                    download_url: uploaded.downloadUrl,
                    mime_type: uploaded.mimeType,
                    size: optimized.size,
                    original_size: optimized.originalSize,
                    optimized: optimized.optimized,
                    checksum,
                }
            });
        } catch (error) {
            removeTempFile();
            console.error('Rich text image upload failed:', error.message);
            res.status(500).json({ message: req.t('upload.failed') });
        }
    }
];

exports.getRichTextImage = async (req, res) => {
    const bucket = getRichTextBucket();
    if (!bucket) {
        return res.status(404).json({ message: req.t('upload.notFound') });
    }

    try {
        const objectName = decodeURIComponent(req.params.objectName);
        const url = await storage.getDownloadUrl(RICHTEXT_STORAGE_SCOPE, {
            provider: 'minio',
            bucket,
            objectName,
        });
        res.redirect(url);
    } catch (error) {
        res.status(404).json({ message: req.t('upload.notFound') });
    }
};
