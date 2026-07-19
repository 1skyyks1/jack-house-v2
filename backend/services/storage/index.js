const PROVIDERS = {
    minio: () => require('./minioStorage'),
    github: () => require('./githubStorage'),
};

const getProviderName = (scope) => {
    const providerName = process.env[`${scope}_STORAGE_PROVIDER`];
    if (!providerName) {
        throw new Error(`${scope}_STORAGE_PROVIDER is required`);
    }
    return providerName.toLowerCase();
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
    const { provider: providerOverride, ...uploadOptions } = options;
    const providerName = (providerOverride || getProviderName(scope)).toLowerCase();
    if (providerName !== 'github') {
        throw new Error(`Uploads are only supported by GitHub storage: ${scope}`);
    }
    const uploaded = await getStorageProvider(scope, providerName).uploadFile({ scope, ...uploadOptions });

    return {
        provider: providerName,
        objectName: uploaded.objectName,
        objectKey: uploaded.objectKey || uploaded.objectName,
        url: uploaded.url,
        publicUrl: uploaded.publicUrl || null,
        downloadUrl: uploaded.downloadUrl || uploaded.publicUrl || null,
        mimeType: uploadOptions.mimeType || null,
        size: uploadOptions.size || null,
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
