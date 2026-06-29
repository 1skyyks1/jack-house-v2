const fs = require('fs/promises');
const fetch = require('node-fetch');

const DEFAULT_OWNER = '1skyyks1';
const DEFAULT_REPO = 'jack-house-img';

const requireEnv = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required for GitHub storage`);
    }
    return value;
};

const trimSlashes = (value = '') => value.replace(/^\/+|\/+$/g, '');

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

const getConfig = (scope) => {
    const prefix = `${scope}_GITHUB_STORAGE_`;
    return {
        token: process.env[`${prefix}TOKEN`] || requireEnv('GITHUB_STORAGE_TOKEN'),
        owner: process.env[`${prefix}OWNER`] || process.env.GITHUB_STORAGE_OWNER || DEFAULT_OWNER,
        repo: process.env[`${prefix}REPO`] || process.env.GITHUB_STORAGE_REPO || DEFAULT_REPO,
        branch: process.env[`${prefix}BRANCH`] || process.env.GITHUB_STORAGE_BRANCH || 'main',
        basePath: trimSlashes(process.env[`${prefix}BASE_PATH`] || process.env.GITHUB_STORAGE_BASE_PATH || ''),
        publicBaseUrl: trimSlashes(process.env[`${prefix}PUBLIC_BASE_URL`] || process.env.GITHUB_STORAGE_PUBLIC_BASE_URL || ''),
        cdn: (process.env[`${prefix}CDN`] || process.env.GITHUB_STORAGE_CDN || 'jsdelivr').toLowerCase(),
    };
};

const getApiHeaders = (token) => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
});

const buildObjectPath = (config, bucket, objectName) => {
    return [config.basePath, trimSlashes(bucket), objectName].filter(Boolean).join('/');
};

const resolveObjectPath = (config, bucket, objectName) => {
    const normalizedObjectName = trimSlashes(objectName);
    if (normalizedObjectName.includes('/')) {
        return normalizedObjectName;
    }
    return buildObjectPath(config, bucket, normalizedObjectName);
};

const buildPublicUrl = (config, objectPath) => {
    if (config.publicBaseUrl) {
        return `${config.publicBaseUrl}/${encodePath(objectPath)}`;
    }

    if (config.cdn === 'raw') {
        return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${encodePath(objectPath)}`;
    }

    return `https://cdn.jsdelivr.net/gh/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodePath(objectPath)}`;
};

const fetchExistingSha = async (config, objectPath) => {
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodePath(objectPath)}?ref=${encodeURIComponent(config.branch)}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: getApiHeaders(config.token),
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`GitHub storage lookup failed: ${response.status}`);
    }

    const data = await response.json();
    return data.sha;
};

const uploadFile = async ({ scope, bucket, objectName, filePath }) => {
    const config = getConfig(scope);
    const objectPath = buildObjectPath(config, bucket, objectName);
    const content = await fs.readFile(filePath, { encoding: 'base64' });
    const sha = await fetchExistingSha(config, objectPath);

    const body = {
        message: `Upload ${objectPath}`,
        content,
        branch: config.branch,
    };

    if (sha) {
        body.sha = sha;
    }

    const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodePath(objectPath)}`, {
        method: 'PUT',
        headers: getApiHeaders(config.token),
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`GitHub storage upload failed: ${response.status}`);
    }

    return {
        objectName,
        objectKey: objectPath,
        url: buildPublicUrl(config, objectPath),
        publicUrl: buildPublicUrl(config, objectPath),
        downloadUrl: buildPublicUrl(config, objectPath),
    };
};

const getDownloadUrl = async ({ scope, bucket, objectName }) => {
    const config = getConfig(scope);
    return buildPublicUrl(config, resolveObjectPath(config, bucket, objectName));
};

const deleteFile = async ({ scope, bucket, objectName }) => {
    const config = getConfig(scope);
    const objectPath = resolveObjectPath(config, bucket, objectName);
    const sha = await fetchExistingSha(config, objectPath);

    if (!sha) {
        return;
    }

    const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodePath(objectPath)}`, {
        method: 'DELETE',
        headers: getApiHeaders(config.token),
        body: JSON.stringify({
            message: `Delete ${objectPath}`,
            sha,
            branch: config.branch,
        }),
    });

    if (!response.ok) {
        throw new Error(`GitHub storage delete failed: ${response.status}`);
    }
};

module.exports = {
    uploadFile,
    getDownloadUrl,
    deleteFile,
};
