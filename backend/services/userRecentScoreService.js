const { Op } = require('sequelize');
const { Pack, PackMap, PackScore } = require('../models');
const { snapshotScore, select } = require('./pp/repository');

function jsonColumn(value) {
    if (typeof value !== 'string') return value ?? null;
    try { return JSON.parse(value); } catch { return null; }
}

async function listUserRecentScores(userId, query = {}) {
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20));
    const offset = Math.max(0, Number.parseInt(query.offset, 10) || 0);
    const { rows, count } = await PackScore.findAndCountAll({
        where: { user_id: userId },
        attributes: ['id', 'pack_id', 'beatmap_id', 'score', 'accuracy', 'max_combo', 'score_rank', 'statistics', 'mods', 'build_id', 'osu_score_id', 'played_at', 'updated_time'],
        include: [{
            model: Pack, as: 'pack', required: true,
            where: { leaderboard_enabled: true },
            attributes: ['pack_id', 'artist', 'artist_unicode', 'creator', 'osu_bid', 'title', 'title_unicode', 'type'],
        }],
        order: [['played_at', 'DESC'], ['id', 'DESC']],
        limit, offset,
    });
    const maps = rows.length ? await PackMap.findAll({
        where: { [Op.or]: rows.map(row => ({ pack_id: row.pack_id, beatmap_id: row.beatmap_id })) },
        attributes: ['pack_id', 'beatmap_id', 'rating', 'version'],
    }) : [];
    const mapById = new Map(maps.map(map => [`${map.pack_id}:${map.beatmap_id}`, map]));

    // 重要设计说明: 依据成绩快照指纹精确关联 PP 候选，避免因同图其他成绩混淆 PP
    const attemptKeys = [];
    const attemptKeyByScoreId = new Map();
    for (const row of rows) {
        const raw = {
            ...row.toJSON(),
            id: row.osu_score_id,
            statistics: jsonColumn(row.statistics),
            mods: jsonColumn(row.mods),
            ended_at: row.played_at,
            passed: true,
        };
        try {
            const snapshot = snapshotScore(raw, Number(userId));
            if (snapshot?.attemptKey) {
                attemptKeys.push(snapshot.attemptKey);
                attemptKeyByScoreId.set(row.id, snapshot.attemptKey);
            }
        } catch {
            // 无法生成指纹的成绩保留，后续回退为 unavailable
        }
    }

    const ppResultByKey = new Map();
    if (attemptKeys.length > 0) {
        const uniqueKeys = [...new Set(attemptKeys)];
        const results = await select(
            `SELECT a.attempt_key, r.status, r.pp
             FROM pp_score_attempt a
             JOIN pp_score_result r ON r.attempt_id = a.id
             JOIN pp_rules rules ON rules.id = 1 AND rules.algorithm_version = r.algorithm_version
             WHERE a.attempt_key IN (:uniqueKeys)`,
            { uniqueKeys }
        );
        for (const item of results) {
            ppResultByKey.set(item.attempt_key, item);
        }
    }

    const data = rows.map(row => {
        const score = row.toJSON();
        const beatmap = mapById.get(`${score.pack_id}:${score.beatmap_id}`);
        const attemptKey = attemptKeyByScoreId.get(row.id);
        const ppResult = attemptKey ? ppResultByKey.get(attemptKey) : null;

        let pp = null;
        let pp_status = 'unavailable';

        if (ppResult) {
            pp_status = ppResult.status;
            if (ppResult.status === 'ready' && ppResult.pp != null) {
                pp = Number(ppResult.pp);
            }
        }

        return {
            id: Number(score.id), pack_id: Number(score.pack_id), beatmap_id: Number(score.beatmap_id),
            score: Number(score.score), accuracy: score.accuracy == null ? null : Number(score.accuracy),
            max_combo: score.max_combo, score_rank: score.score_rank,
            statistics: jsonColumn(score.statistics), mods: jsonColumn(score.mods),
            build_id: score.build_id == null ? null : Number(score.build_id), is_lazer: Number(score.build_id) > 0,
            played_at: score.played_at || score.updated_time,
            pack: score.pack,
            beatmap: { beatmap_id: Number(score.beatmap_id), rating: beatmap?.rating == null ? null : Number(beatmap.rating), version: beatmap?.version ?? null },
            pp,
            pp_status,
        };
    });
    const hasMore = offset + rows.length < count;
    return { data, total: count, hasMore, nextOffset: hasMore ? offset + rows.length : null };
}

module.exports = { listUserRecentScores };
