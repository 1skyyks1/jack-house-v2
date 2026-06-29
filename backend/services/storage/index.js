const PROVIDERS = {
    minio: () => require('./minioStorage'),
    github: () => require('./githubStorage'),
};

const getProviderName = (scope) => {
    return (process.env[`${scope}_STORAGE_PROVIDER`] || 'minio').toLowerCase();
};

const getBucketName = (scope, fallbackEnvNames = [], defaultBucket = null) => {
    const envNames = [`${scope}_STORAGE_BUCKET`, ...fallbackEnvNames];

    for (const envName of envNames) {
        const value = process.env[envName];
        if (value) {
            return value;
        }
    }

    return defaultBucket;
};

const getStorageProvider = (scope, providerOverride) => {
    const providerName = (providerOverride || getProviderName(scope)).toLowerCase();
    const provider = PROVIDERS[providerName];

    if (!provider) {
        throw new Error(`Unsupported storage provider: ${providerName}`);
    }

    return provider();
};

const uploadFile = async (scope, options) => {
    const providerName = getProviderName(scope);
    const uploaded = await getStorageProvider(scope).uploadFile({ scope, ...options });

    return {
        provider: providerName,
        objectName: uploaded.objectName,
        objectKey: uploaded.objectKey || uploaded.objectName,
        url: uploaded.url,
        publicUrl: uploaded.publicUrl || null,
        downloadUrl: uploaded.downloadUrl || uploaded.publicUrl || null,
        mimeType: options.mimeType || null,
        size: options.size || null,
    };
};

const getDownloadUrl = async (scope, options) => {
    return getStorageProvider(scope, options.provider).getDownloadUrl({ scope, ...options });
};

const deleteFile = async (scope, options) => {
    return getStorageProvider(scope, options.provider).deleteFile({ scope, ...options });
};

module.exports = {
    getProviderName,
    getBucketName,
    uploadFile,
    getDownloadUrl,
    deleteFile,
};
