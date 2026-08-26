const osu = require('osu-api-v2-js');
const { EventScore } = require('../models');

const CLIENT_ID = Number(process.env.OSU_CLIENT_ID);
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;

const getScoreValue = (score) => {
    for (const candidate of [score?.legacy_total_score, score?.total_score, score?.score]) {
        const value = Number(candidate);
        if (Number.isFinite(value) && value > 0) return Math.round(value);
    }
    return null;
};

const getPlayedAt = (score) => {
    const value = score?.ended_at || score?.created_at || score?.started_at;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getOsuScoreId = (score) => {
    const value = score?.id ?? score?.legacy_score_id;
    return value === undefined || value === null ? null : String(value);
};

const getScoreDetails = (score) => {
    const accuracy = Number(score?.accuracy);
    const maxCombo = Number(score?.max_combo);
    const buildId = Number(score?.build_id);
    const scoreRank = typeof score?.rank === 'string' ? score.rank.slice(0, 2) : null;
    const statistics = score?.statistics && typeof score.statistics === 'object'
        ? score.statistics
        : null;
    const mods = Array.isArray(score?.mods)
        ? score.mods.map((mod) => ({
            acronym: String(mod?.acronym || mod || '').toUpperCase(),
            ...(mod?.settings && typeof mod.settings === 'object' ? { settings: mod.settings } : {}),
        })).filter((mod) => mod.acronym)
        : null;

    return {
        accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
        build_id: Number.isSafeInteger(buildId) && buildId > 0 ? buildId : null,
        max_combo: Number.isSafeInteger(maxCombo) && maxCombo >= 0 ? maxCombo : null,
        mods,
        score_rank: scoreRank,
        statistics,
    };
};

const fetchRecentManiaScores = async (user, limit = 50) => {
    if (!user?.osu_uid) return [];
    const api = await osu.API.createAsync(CLIENT_ID, CLIENT_SECRET);
    const osuUser = await api.getUser(Number(user.osu_uid));
    return api.getUserScores(
        osuUser,
        'recent',
        osu.Ruleset.mania,
        { lazer: true, fails: false },
        { limit }
    );
};

const getBestScoresByBeatmap = (scores, beatmapIds) => {
    const allowed = new Set([...beatmapIds].map(Number));
    const best = new Map();

    for (const score of scores || []) {
        const beatmapId = Number(score?.beatmap_id ?? score?.beatmap?.id);
        const scoreValue = getScoreValue(score);
        if (!allowed.has(beatmapId) || scoreValue === null) continue;

        const current = best.get(beatmapId);
        if (!current || scoreValue > current.scoreValue) {
            best.set(beatmapId, { raw: score, scoreValue });
        }
    }

    return best;
};

const upsertBestScore = async ({ beatmapId, eventId, stageId, userId, score }, options = {}) => {
    const where = {
        beatmap_id: Number(beatmapId),
        event_id: Number(eventId),
        user_id: Number(userId),
    };
    const defaults = {
        ...where,
        stage_id: stageId ? Number(stageId) : null,
        score: score.scoreValue,
        ...getScoreDetails(score.raw),
        osu_score_id: getOsuScoreId(score.raw),
        played_at: getPlayedAt(score.raw),
    };
    const queryOptions = options.transaction ? { transaction: options.transaction } : {};
    const [record, created] = await EventScore.findOrCreate({
        where,
        defaults,
        ...queryOptions,
    });

    if (created) return { record, updated: true };
    if (score.scoreValue <= Number(record.score)) return { record, updated: false };

    await record.update({
        score: score.scoreValue,
        ...getScoreDetails(score.raw),
        stage_id: stageId ? Number(stageId) : record.stage_id,
        osu_score_id: getOsuScoreId(score.raw),
        played_at: getPlayedAt(score.raw),
    }, queryOptions);
    return { record, updated: true };
};

module.exports = {
    fetchRecentManiaScores,
    getBestScoresByBeatmap,
    getOsuScoreId,
    getPlayedAt,
    getScoreDetails,
    getScoreValue,
    upsertBestScore,
};
