const osu = require('osu-api-v2-js');
const { EventScore, PackScore } = require('../models');

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

const MANIA_JUDGEMENTS = ['perfect', 'great', 'good', 'ok', 'meh', 'miss'];

const calculateManiaAccuracyAndRank = (statistics, mods = []) => {
    if (!statistics || typeof statistics !== 'object') return null;

    const counts = Object.fromEntries(MANIA_JUDGEMENTS.map((judgement) => {
        const value = Number(statistics[judgement] ?? 0);
        return [judgement, Number.isFinite(value) && value >= 0 ? value : 0];
    }));
    const totalJudgements = MANIA_JUDGEMENTS.reduce((total, judgement) => total + counts[judgement], 0);
    if (totalJudgements <= 0) return null;

    const acronyms = new Set((mods || []).map((mod) => String(mod?.acronym || mod || '').toUpperCase()));
    const isClassic = acronyms.has('CL');
    const maximumValue = isClassic ? 300 : 320;
    const earnedValue = (counts.perfect * maximumValue)
        + (counts.great * 300)
        + (counts.good * 200)
        + (counts.ok * 100)
        + (counts.meh * 50);
    const accuracy = earnedValue / (totalJudgements * maximumValue);

    let rank;
    if (isClassic ? accuracy === 1 : counts.good + counts.ok + counts.meh + counts.miss === 0) {
        rank = 'X';
    } else if (isClassic ? accuracy > 0.95 : accuracy >= 0.95) {
        rank = 'S';
    } else if (isClassic ? accuracy > 0.90 : accuracy >= 0.90) {
        rank = 'A';
    } else if (isClassic ? accuracy > 0.80 : accuracy >= 0.80) {
        rank = 'B';
    } else if (isClassic ? accuracy > 0.70 : accuracy >= 0.70) {
        rank = 'C';
    } else {
        rank = 'D';
    }

    if ((rank === 'X' || rank === 'S') && ['HD', 'FL', 'FI'].some((mod) => acronyms.has(mod))) {
        rank += 'H';
    }

    return { accuracy, rank };
};

const getScoreDetails = (score) => {
    const maxCombo = Number(score?.max_combo);
    const buildId = Number(score?.build_id);
    const statistics = score?.statistics && typeof score.statistics === 'object'
        ? score.statistics
        : null;
    const mods = Array.isArray(score?.mods)
        ? score.mods.map((mod) => ({
            acronym: String(mod?.acronym || mod || '').toUpperCase(),
            ...(mod?.settings && typeof mod.settings === 'object' ? { settings: mod.settings } : {}),
        })).filter((mod) => mod.acronym)
        : null;
    const calculated = calculateManiaAccuracyAndRank(statistics, mods);
    const apiAccuracy = Number(score?.accuracy);
    const apiRank = typeof score?.rank === 'string' ? score.rank.slice(0, 2) : null;

    return {
        accuracy: calculated?.accuracy
            ?? (Number.isFinite(apiAccuracy) && apiAccuracy >= 0 ? apiAccuracy : null),
        build_id: Number.isSafeInteger(buildId) && buildId > 0 ? buildId : null,
        max_combo: Number.isSafeInteger(maxCombo) && maxCombo >= 0 ? maxCombo : null,
        mods,
        score_rank: calculated?.rank ?? apiRank,
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

const fetchRecentManiaScoresSince = async (user, since, pageSize = 100, maxPages = 20) => {
    if (!user?.osu_uid) return [];
    const sinceTime = since instanceof Date ? since.getTime() : new Date(since).getTime();
    if (!Number.isFinite(sinceTime)) throw new TypeError('A valid since date is required');

    const api = await osu.API.createAsync(CLIENT_ID, CLIENT_SECRET);
    const osuUser = await api.getUser(Number(user.osu_uid));
    const collected = [];

    for (let page = 0; page < maxPages; page += 1) {
        const scores = await api.getUserScores(
            osuUser,
            'recent',
            osu.Ruleset.mania,
            { lazer: true, fails: false },
            { limit: pageSize, offset: page * pageSize }
        );
        if (!Array.isArray(scores) || scores.length === 0) break;

        let reachedOlderScore = false;
        for (const score of scores) {
            const playedAt = getPlayedAt(score);
            if (playedAt && playedAt.getTime() >= sinceTime) {
                collected.push(score);
            } else {
                reachedOlderScore = true;
            }
        }

        if (scores.length < pageSize || reachedOlderScore) break;
    }

    return collected;
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

const upsertBestPackScore = async ({ beatmapId, packId, userId, score }, options = {}) => {
    const where = {
        beatmap_id: Number(beatmapId),
        pack_id: Number(packId),
        user_id: Number(userId),
    };
    const defaults = {
        ...where,
        score: score.scoreValue,
        ...getScoreDetails(score.raw),
        osu_score_id: getOsuScoreId(score.raw),
        played_at: getPlayedAt(score.raw),
    };
    const queryOptions = options.transaction ? { transaction: options.transaction } : {};
    const [record, created] = await PackScore.findOrCreate({
        where,
        defaults,
        ...queryOptions,
    });

    if (created) return { created: true, record, updated: true };
    if (score.scoreValue <= Number(record.score)) return { created: false, record, updated: false };

    await record.update({
        score: score.scoreValue,
        ...getScoreDetails(score.raw),
        osu_score_id: getOsuScoreId(score.raw),
        played_at: getPlayedAt(score.raw),
    }, queryOptions);
    return { created: false, record, updated: true };
};

module.exports = {
    calculateManiaAccuracyAndRank,
    fetchRecentManiaScores,
    fetchRecentManiaScoresSince,
    getBestScoresByBeatmap,
    getOsuScoreId,
    getPlayedAt,
    getScoreDetails,
    getScoreValue,
    upsertBestScore,
    upsertBestPackScore,
};
