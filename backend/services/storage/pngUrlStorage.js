const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

const DEFAULT_API_BASE_URL = 'https://pngurl.com/api/v1';
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;

const positiveInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getOptionalStrategyId = (scope) => {
    const envName = `PNG_URL_${scope}_STRATEGY_ID`;
    const value = String(process.env[envName] || '').trim();
    if (!value) return null;

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${envName} must be a positive integer`);
    }
    return parsed;
};

const getConfig = (scope) => {
    const token = String(process.env.PNG_URL_API_TOKEN || '').trim();
    if (!token) {
        throw new Error('PNG_URL_API_TOKEN is required for PNGURL storage');
    }

    return {
        apiBaseUrl: String(process.env.PNG_URL_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, ''),
        strategyId: getOptionalStrategyId(scope),
        token,
        timeoutMs: positiveInteger(process.env.PNG_URL_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    };
};

const fetchWithTimeout = async (fetchImpl, url, options, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`PNGURL storage request timed out after ${timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
};

const parseResponse = async (response, operation) => {
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.status) {
        throw new Error(payload?.message || `PNGURL storage ${operation} failed: ${response.status}`);
    }
    return payload.data;
};

const uploadFile = async ({ scope, objectName, filePath, mimeType, fetchImpl = fetch }) => {
    const config = getConfig(scope);
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), {
        filename: objectName,
        contentType: mimeType || 'application/octet-stream',
    });
    if (config.strategyId) {
        form.append('strategy_id', String(config.strategyId));
    }
    form.append('permission', '1');

    const response = await fetchWithTimeout(fetchImpl, `${config.apiBaseUrl}/upload`, {
        method: 'POST',
        headers: {
            ...form.getHeaders(),
            Accept: 'application/json',
            Authorization: `Bearer ${config.token}`,
        },
        body: form,
    }, config.timeoutMs);
    const data = await parseResponse(response, 'upload');
    if (!data?.key || !data?.url) {
        throw new Error('PNGURL storage upload returned an invalid response');
    }

    return {
        objectName: data.key,
        objectKey: data.key,
        url: data.url,
        publicUrl: data.url,
        downloadUrl: data.url,
    };
};

const getDownloadUrl = async ({ objectName }) => {
    if (/^https?:\/\//i.test(objectName || '')) {
        return objectName;
    }
    throw new Error('PNGURL records must retain public_url or download_url');
};

const deleteFile = async ({ scope, objectName, fetchImpl = fetch }) => {
    if (!objectName) return;

    const config = getConfig(scope);
    const response = await fetchWithTimeout(fetchImpl, `${config.apiBaseUrl}/images/${encodeURIComponent(objectName)}`, {
        method: 'DELETE',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.token}`,
        },
    }, config.timeoutMs);

    if (response.status === 404) return;
    await parseResponse(response, 'delete');
};

module.exports = {
    deleteFile,
    getDownloadUrl,
    uploadFile,
};
