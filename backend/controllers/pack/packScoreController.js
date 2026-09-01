const { QueryTypes } = require('sequelize');
const { Pack, PackMap, User } = require('../../models');
const sequelize = require('../../config/db');
const {
    fetchRecentManiaScoresSince,
    getBestScoresByBeatmap,
    upsertBestPackScore,
} = require('../../services/beatmapScoreService');
const { isPackRankEligibleMap } = require('../../services/packRankService');

const RECENT_SCORE_WINDOW_MS = 24 * 60 * 60 * 1000;

const parsePagination = (query) => {
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || 10, 1), 50);
    return { page, pageSize, offset: (page - 1) * pageSize };
};

const findPackMap = (packId, beatmapId) => PackMap.findOne({
    where: { pack_id: Number(packId), beatmap_id: Number(beatmapId) },
});

const getLeaderboardState = async (packId) => {
    const pack = await Pack.findByPk(packId, { attributes: ['pack_id', 'leaderboard_enabled'] });
    return {
        canSubmit: Boolean(pack?.leaderboard_enabled),
        enabled: Boolean(pack?.leaderboard_enabled),
    };
};

const getBeatmapLeaderboardState = (pack, packMap) => {
    const enabled = Boolean(pack?.leaderboard_enabled) && isPackRankEligibleMap(packMap);
    return { canSubmit: enabled, enabled };
};

const leaderboardCte = `
    WITH ranked_scores AS (
        SELECT ps.user_id, ps.score, ps.accuracy, ps.max_combo, ps.score_rank,
               ps.statistics, ps.mods, ps.build_id, ps.played_at, ps.updated_time,
               RANK() OVER (ORDER BY ps.score DESC, ps.updated_time ASC) AS rank_position
        FROM pack_score ps
        WHERE ps.pack_id = :packId AND ps.beatmap_id = :beatmapId
    )
`;

function parseJsonColumn(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

const mapLeaderboardRow = (row) => ({
    accuracy: row.accuracy == null ? null : Number(row.accuracy),
    build_id: row.build_id == null ? null : Number(row.build_id),
    is_lazer: row.build_id != null,
    max_combo: row.max_combo == null ? null : Number(row.max_combo),
    mods: parseJsonColumn(row.mods),
    rank: Number(row.rank_position),
    score: Number(row.score),
    score_rank: row.score_rank || null,
    statistics: parseJsonColumn(row.statistics),
    played_at: row.played_at || null,
    updated_time: row.updated_time,
    user_id: Number(row.user_id),
    user: {
        avatar: row.avatar || null,
        user_name: row.user_name,
    },
});

const syncScorePairs = async ({ pairs, scores, userId }) => {
    const uniquePairs = [...new Map(pairs.map((pair) => [
        `${Number(pair.packId)}:${Number(pair.beatmapId)}`,
        { packId: Number(pair.packId), beatmapId: Number(pair.beatmapId) },
    ])).values()];
    const beatmapIds = new Set(uniquePairs.map((pair) => pair.beatmapId));
    const bestScores = getBestScoresByBeatmap(scores, beatmapIds);
    const summary = { matched: 0, created: 0, updated: 0, unchanged: 0 };

    await sequelize.transaction(async (transaction) => {
        for (const pair of uniquePairs) {
            const score = bestScores.get(Number(pair.beatmapId));
            if (!score) continue;
            summary.matched += 1;
            const result = await upsertBestPackScore({
                beatmapId: pair.beatmapId,
                packId: pair.packId,
                score,
                userId,
            }, { transaction });
            if (result.created) summary.created += 1;
            else if (result.updated) summary.updated += 1;
            else summary.unchanged += 1;
        }
    });

    return summary;
};

const fetchLast24Hours = async (user, source) => fetchRecentManiaScoresSince(
    user,
    new Date(Date.now() - RECENT_SCORE_WINDOW_MS),
    100,
    20,
    { source }
);

exports.getBeatmapLeaderboard = async (req, res) => {
    const { pack_id: packId, beatmap_id: beatmapId } = req.params;
    const pagination = parsePagination(req.query);

    try {
        const [pack, packMap] = await Promise.all([
            Pack.findByPk(packId, { attributes: ['pack_id', 'leaderboard_enabled'] }),
            findPackMap(packId, beatmapId),
        ]);
        if (!pack || !packMap) return res.status(404).json({ message: req.t('pack.beatmapNotFound') });

        const state = getBeatmapLeaderboardState(pack, packMap);
        if (!state.enabled) {
            return res.status(200).json({
                ...state,
                data: [],
                page: pagination.page,
                pageSize: pagination.pageSize,
                personal: null,
                total: 0,
                totalPages: 0,
            });
        }

        const countRows = await sequelize.query(
            'SELECT COUNT(*) AS total FROM pack_score WHERE pack_id = :packId AND beatmap_id = :beatmapId',
            { replacements: { packId: Number(packId), beatmapId: Number(beatmapId) }, type: QueryTypes.SELECT }
        );
        const rows = await sequelize.query(`${leaderboardCte}
            SELECT ranked_scores.*, u.user_name, u.avatar
            FROM ranked_scores
            JOIN \`user\` AS u ON u.user_id = ranked_scores.user_id
            ORDER BY rank_position ASC
            LIMIT :limit OFFSET :offset`, {
            replacements: {
                packId: Number(packId),
                beatmapId: Number(beatmapId),
                limit: pagination.pageSize,
                offset: pagination.offset,
            },
            type: QueryTypes.SELECT,
        });

        let personal = null;
        if (req.user?.user_id) {
            const personalRows = await sequelize.query(`${leaderboardCte}
                SELECT ranked_scores.*, u.user_name, u.avatar
                FROM ranked_scores
                JOIN \`user\` AS u ON u.user_id = ranked_scores.user_id
                WHERE ranked_scores.user_id = :userId`, {
                replacements: {
                    packId: Number(packId),
                    beatmapId: Number(beatmapId),
                    userId: Number(req.user.user_id),
                },
                type: QueryTypes.SELECT,
            });
            personal = personalRows[0] ? mapLeaderboardRow(personalRows[0]) : null;
        }

        const total = Number(countRows[0]?.total || 0);
        return res.status(200).json({
            ...state,
            data: rows.map(mapLeaderboardRow),
            page: pagination.page,
            pageSize: pagination.pageSize,
            personal,
            total,
            totalPages: Math.ceil(total / pagination.pageSize),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: req.t('osuScore.serverError') });
    }
};

exports.syncPackScores = async (req, res) => {
    const packId = Number(req.params.pack_id);
    const userId = Number(req.user.user_id);

    try {
        const pack = await Pack.findByPk(packId, {
            attributes: ['pack_id', 'leaderboard_enabled'],
            include: [{ model: PackMap, as: 'maps', attributes: ['beatmap_id', 'rating'] }],
        });
        if (!pack) return res.status(404).json({ message: req.t('pack.notFound') });
        if (!pack.leaderboard_enabled) {
            return res.status(403).json({ message: req.t('pack.leaderboardUnavailable') });
        }

        const user = await User.findByPk(userId);
        const scores = await fetchLast24Hours(user, 'pack_score_sync');
        const pairs = (pack.maps || [])
            .filter(isPackRankEligibleMap)
            .map((map) => ({ packId, beatmapId: Number(map.beatmap_id) }));
        const summary = await syncScorePairs({ pairs, scores, userId });
        return res.status(200).json({ data: summary, message: req.t('pack.syncScoresSuccess') });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: req.t('osuScore.serverError') });
    }
};

exports.syncAllFeaturedScores = async (req, res) => {
    const userId = Number(req.user.user_id);

    try {
        const packs = await Pack.findAll({
            where: { leaderboard_enabled: true },
            attributes: ['pack_id'],
            include: [{ model: PackMap, as: 'maps', attributes: ['beatmap_id', 'rating'] }],
        });
        const pairs = packs.flatMap((pack) => (pack.maps || [])
            .filter(isPackRankEligibleMap)
            .map((map) => ({ packId: Number(pack.pack_id), beatmapId: Number(map.beatmap_id) })));
        if (pairs.length === 0) {
            return res.status(200).json({
                data: { matched: 0, created: 0, updated: 0, unchanged: 0 },
                message: req.t('pack.syncScoresSuccess'),
            });
        }

        const user = await User.findByPk(userId);
        const scores = await fetchLast24Hours(user, 'featured_score_sync');
        const summary = await syncScorePairs({ pairs, scores, userId });
        return res.status(200).json({ data: summary, message: req.t('pack.syncScoresSuccess') });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: req.t('osuScore.serverError') });
    }
};

module.exports.getLeaderboardState = getLeaderboardState;
module.exports.syncScorePairs = syncScorePairs;
