const storage = require('./storage');

const BADGES_STORAGE_SCOPE = 'BADGES';
const BADGES_STORAGE_PROVIDER = 'github';

const getBadgeObjectName = (badge) => badge.object_key || badge.minio_img_name;

const getBadgesBucket = () => storage.getBucketName(
    BADGES_STORAGE_SCOPE,
    [],
    'badges'
);

const getBadgeImageUrl = async (badge) => {
    if (badge.storage_provider === BADGES_STORAGE_PROVIDER && (badge.public_url || badge.download_url)) {
        return badge.public_url || badge.download_url;
    }

    const objectName = getBadgeObjectName(badge);
    if (!objectName) {
        return badge.url || null;
    }

    return storage.getDownloadUrl(BADGES_STORAGE_SCOPE, {
        provider: BADGES_STORAGE_PROVIDER,
        bucket: getBadgesBucket(),
        objectName,
    });
};

const uploadBadgeFile = async (options) => storage.uploadFile(BADGES_STORAGE_SCOPE, {
    ...options,
    provider: BADGES_STORAGE_PROVIDER,
    bucket: getBadgesBucket(),
});

const deleteBadgeFile = async (badge) => {
    const objectName = getBadgeObjectName(badge);
    if (!objectName) {
        return;
    }

    await storage.deleteFile(BADGES_STORAGE_SCOPE, {
        provider: BADGES_STORAGE_PROVIDER,
        bucket: getBadgesBucket(),
        objectName,
    });
};

module.exports = {
    BADGES_STORAGE_PROVIDER,
    BADGES_STORAGE_SCOPE,
    deleteBadgeFile,
    getBadgeImageUrl,
    getBadgeObjectName,
    getBadgesBucket,
    uploadBadgeFile,
};
