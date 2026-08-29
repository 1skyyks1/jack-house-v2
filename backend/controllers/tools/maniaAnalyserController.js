const fetch = require('node-fetch');
const osu = require('osu-api-v2-js');

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 128;
const MAX_BEATMAP_BYTES = 2 * 1024 * 1024;
const MAX_COVER_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10 * 1000;
const beatmapCache = new Map();

exports.isBeatmapCached = (beatmapId) => {
    const numericBeatmapId = Number(beatmapId);
    return Number.isSafeInteger(numericBeatmapId) && numericBeatmapId > 0 && Boolean(getCachedBeatmap(numericBeatmapId));
};

exports.getBeatmapSource = async (req, res) => handleBeatmapSource(req, res, { only4k: true });

exports.getPublicBeatmapSource = async (req, res) => handleBeatmapSource(req, res, { only4k: false });

async function handleBeatmapSource(req, res, { only4k }) {
    const beatmapId = Number(req.params.beatmapId);
    if (!Number.isSafeInteger(beatmapId) || beatmapId <= 0) {
        return res.status(400).json({ message: req.t('maniaAnalyser.invalidBeatmapId') });
    }

    try {
        const data = getCachedBeatmap(beatmapId) || await loadBeatmapSource(beatmapId);
        if (only4k && data.beatmap.keyCount !== 4) {
            throw createHttpError(422, 'Only 4K beatmaps are supported', 'ONLY_4K');
        }
        return res.json({ data });
    } catch (error) {
        const status = resolveErrorStatus(error);
        if (status >= 500) console.error('Failed to load beatmap for mania analyser:', error);
        return res.status(status).json({ message: translateError(req, status, error?.code) });
    }
}

async function loadBeatmapSource(beatmapId) {
    const clientId = Number(process.env.OSU_CLIENT_ID);
    const clientSecret = process.env.OSU_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw createHttpError(503, 'osu! API credentials are not configured');
    }

    const api = await osu.API.createAsync(clientId, clientSecret);
    const [beatmap, osuText] = await Promise.all([
        api.getBeatmap(beatmapId),
        fetchBeatmapText(beatmapId),
    ]);

    if (!beatmap) throw createHttpError(404, 'Beatmap not found');

    const mode = String(beatmap.mode || '').toLowerCase();
    if ((mode && mode !== 'mania') || !/^\s*Mode\s*:\s*3\s*$/m.test(osuText)) {
        throw createHttpError(422, 'Beatmap is not osu!mania');
    }

    const keyCount = getKeyCount(beatmap, osuText);
    if (!Number.isInteger(keyCount) || keyCount < 1 || keyCount > 18) {
        throw createHttpError(422, 'Beatmap has an invalid key count');
    }

    const beatmapsetId = finiteNumberOrNull(beatmap.beatmapset_id ?? beatmap.beatmapset?.id);
    const covers = beatmap.beatmapset?.covers || {};
    const data = {
        beatmap: {
            artist: String(beatmap.beatmapset?.artist || ''),
            beatmapId,
            beatmapsetId,
            bpm: finiteNumberOrNull(beatmap.bpm),
            coverUrl: covers['cover@2x'] || covers.cover || buildCoverUrl(beatmapsetId),
            creator: String(beatmap.beatmapset?.creator || ''),
            difficultyRating: finiteNumberOrNull(beatmap.difficulty_rating),
            keyCount,
            mode: mode || 'mania',
            title: String(beatmap.beatmapset?.title || ''),
            totalLength: finiteNumberOrNull(beatmap.total_length),
            version: String(beatmap.version || ''),
        },
        osuText,
    };

    cacheBeatmap(beatmapId, data);
    return data;
}

exports.getBeatmapCover = async (req, res) => {
    const beatmapsetId = Number(req.params.beatmapsetId);
    if (!Number.isSafeInteger(beatmapsetId) || beatmapsetId <= 0) {
        return res.status(400).json({ message: req.t('maniaAnalyser.invalidBeatmapId') });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(buildCoverUrl(beatmapsetId), {
            headers: {
                Accept: 'image/avif,image/webp,image/jpeg,image/*',
                'User-Agent': 'JackHouse-ManiaAnalyser/1.0',
            },
            redirect: 'follow',
            signal: controller.signal,
        });

        if (!response.ok) throw createHttpError(response.status === 404 ? 404 : 502, `osu! returned ${response.status}`);

        const contentType = String(response.headers.get('content-type') || '');
        if (!contentType.startsWith('image/')) throw createHttpError(502, 'osu! returned an invalid cover');

        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_BYTES) {
            throw createHttpError(413, 'Beatmap cover is too large');
        }

        const buffer = await response.buffer();
        if (buffer.length > MAX_COVER_BYTES) throw createHttpError(413, 'Beatmap cover is too large');

        res.set({
            'Cache-Control': 'private, max-age=86400',
            'Content-Length': String(buffer.length),
            'Content-Type': contentType,
        });
        return res.send(buffer);
    } catch (error) {
        const status = error?.name === 'AbortError' ? 504 : resolveErrorStatus(error);
        if (status >= 500) console.error('Failed to load beatmap cover for mania analyser:', error);
        return res.status(status).json({ message: translateError(req, status, error?.code) });
    } finally {
        clearTimeout(timeout);
    }
};

async function fetchBeatmapText(beatmapId) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`https://osu.ppy.sh/osu/${beatmapId}`, {
            headers: {
                Accept: 'text/plain',
                'User-Agent': 'JackHouse-ManiaAnalyser/1.0',
            },
            redirect: 'follow',
            signal: controller.signal,
        });

        if (response.status === 404) throw createHttpError(404, 'Beatmap not found');
        if (!response.ok) throw createHttpError(502, `osu! returned ${response.status}`);

        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_BEATMAP_BYTES) {
            throw createHttpError(413, 'Beatmap file is too large');
        }

        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > MAX_BEATMAP_BYTES) {
            throw createHttpError(413, 'Beatmap file is too large');
        }
        if (!text.includes('[HitObjects]')) {
            throw createHttpError(422, 'Invalid beatmap file');
        }
        return text;
    } catch (error) {
        if (error?.name === 'AbortError') throw createHttpError(504, 'osu! request timed out');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function getCachedBeatmap(beatmapId) {
    const cached = beatmapCache.get(beatmapId);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt >= CACHE_TTL_MS) {
        beatmapCache.delete(beatmapId);
        return null;
    }
    return cached.data;
}

function cacheBeatmap(beatmapId, data) {
    beatmapCache.delete(beatmapId);
    beatmapCache.set(beatmapId, { cachedAt: Date.now(), data });
    while (beatmapCache.size > CACHE_MAX_ENTRIES) {
        const oldestKey = beatmapCache.keys().next().value;
        beatmapCache.delete(oldestKey);
    }
}

function finiteNumberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function getKeyCount(beatmap, osuText) {
    const apiKeyCount = Number(beatmap.cs);
    if (Number.isFinite(apiKeyCount)) return Math.round(apiKeyCount);
    const match = osuText.match(/^\s*CircleSize\s*:\s*(\d+(?:\.\d+)?)\s*$/m);
    return match ? Math.round(Number(match[1])) : null;
}

function buildCoverUrl(beatmapsetId) {
    return beatmapsetId ? `https://assets.ppy.sh/beatmaps/${beatmapsetId}/covers/cover@2x.jpg` : null;
}

function createHttpError(status, message, code) {
    const error = new Error(message);
    error.status = status;
    if (code) error.code = code;
    return error;
}

function resolveErrorStatus(error) {
    if (Number.isInteger(error?.status)) return error.status;
    const message = String(error?.message || '');
    if (/404|not found/i.test(message)) return 404;
    if (/abort|timed out/i.test(message)) return 504;
    return 502;
}

function translateError(req, status, code) {
    if (status === 400) return req.t('maniaAnalyser.invalidBeatmapId');
    if (status === 404) return req.t('maniaAnalyser.beatmapNotFound');
    if (status === 413) return req.t('maniaAnalyser.beatmapTooLarge');
    if (status === 422 && code === 'ONLY_4K') return req.t('maniaAnalyser.only4k');
    if (status === 422) return req.t('maniaAnalyser.notMania');
    if (status === 503) return req.t('maniaAnalyser.serviceUnavailable');
    if (status === 504) return req.t('maniaAnalyser.upstreamTimeout');
    return req.t('maniaAnalyser.fetchFailed');
}
