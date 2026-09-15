const { Op } = require('sequelize');
const { Pack, PackMap, PackScore } = require('../models');

function jsonColumn(value) {
    if (typeof value !== 'string') return value ?? null;
    try { return JSON.parse(value); } catch { return null; }
}

async function listUserRecentScores(userId, query = {}) {
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20));
    const offset = Math.max(0, Number.parseInt(query.offset, 10) || 0);
    const { rows, count } = await PackScore.findAndCountAll({
        where: { user_id: userId },
        attributes: ['id', 'pack_id', 'beatmap_id', 'score', 'accuracy', 'max_combo', 'score_rank', 'statistics', 'mods', 'build_id', 'played_at', 'updated_time'],
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
    const data = rows.map(row => {
        const score = row.toJSON();
        const beatmap = mapById.get(`${score.pack_id}:${score.beatmap_id}`);
        return {
            id: Number(score.id), pack_id: Number(score.pack_id), beatmap_id: Number(score.beatmap_id),
            score: Number(score.score), accuracy: score.accuracy == null ? null : Number(score.accuracy),
            max_combo: score.max_combo, score_rank: score.score_rank,
            statistics: jsonColumn(score.statistics), mods: jsonColumn(score.mods),
            build_id: score.build_id == null ? null : Number(score.build_id), is_lazer: score.build_id != null,
            played_at: score.played_at || score.updated_time,
            pack: score.pack,
            beatmap: { beatmap_id: Number(score.beatmap_id), rating: beatmap?.rating == null ? null : Number(beatmap.rating), version: beatmap?.version ?? null },
        };
    });
    const hasMore = offset + rows.length < count;
    return { data, total: count, hasMore, nextOffset: hasMore ? offset + rows.length : null };
}

module.exports = { listUserRecentScores };
