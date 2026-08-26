const { QueryTypes } = require('sequelize');
const { Event, EventScore, EventStage, Pack, PackMap, User } = require('../../models');
const sequelize = require('../../config/db');
const {
    fetchRecentManiaScores,
    getBestScoresByBeatmap,
    upsertBestScore,
} = require('../../services/beatmapScoreService');

const parsePagination = (query) => {
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || 10, 1), 50);
    return { page, pageSize, offset: (page - 1) * pageSize };
};

const findPackMap = (packId, beatmapId) => PackMap.findOne({
    where: { pack_id: Number(packId), beatmap_id: Number(beatmapId) },
});

const getLeaderboardState = async (beatmapId) => {
    const stages = await EventStage.findAll({
        where: { map_id: Number(beatmapId) },
        include: [{ model: Event, as: 'event', attributes: ['id', 'start', 'end'] }],
    });
    const now = Date.now();
    const startedStages = stages.filter((stage) => new Date(stage.event?.start).getTime() <= now);
    const activeStage = startedStages.find((stage) => {
        const start = new Date(stage.event?.start).getTime();
        const end = new Date(stage.event?.end).getTime();
        return start <= now && now <= end;
    });
    const endedStage = startedStages.find((stage) => new Date(stage.event?.end).getTime() < now);
    const scoreCount = await EventScore.count({ where: { beatmap_id: Number(beatmapId) } });

    return {
        activeEventId: activeStage?.event?.id ?? null,
        canSubmit: Boolean(endedStage) && !activeStage,
        enabled: startedStages.length > 0 || scoreCount > 0,
    };
};

const leaderboardCte = `
    WITH user_scoped_scores AS (
        SELECT es.user_id, es.score, es.accuracy, es.max_combo, es.score_rank,
               es.statistics, es.mods, es.build_id, es.played_at, es.updated_time,
               ROW_NUMBER() OVER (
                   PARTITION BY es.user_id
                   ORDER BY es.score DESC, es.updated_time ASC, es.id ASC
               ) AS user_score_row
        FROM event_score es
        WHERE es.beatmap_id = :beatmapId
    ), user_best AS (
        SELECT user_id, score, accuracy, max_combo, score_rank, statistics, mods,
               build_id, played_at, updated_time
        FROM user_scoped_scores
        WHERE user_score_row = 1
    ), ranked_scores AS (
        SELECT user_id, score, accuracy, max_combo, score_rank, statistics, mods,
               build_id, played_at, updated_time,
               RANK() OVER (ORDER BY score DESC, updated_time ASC) AS rank_position
        FROM user_best
    )
`;

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

function parseJsonColumn(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

exports.getBeatmapLeaderboard = async (req, res) => {
    const { pack_id: packId, beatmap_id: beatmapId } = req.params;
    const pagination = parsePagination(req.query);

    try {
        const [pack, packMap] = await Promise.all([
            Pack.findByPk(packId, { attributes: ['pack_id'] }),
            findPackMap(packId, beatmapId),
        ]);
        if (!pack || !packMap) return res.status(404).json({ message: req.t('pack.beatmapNotFound') });

        const state = await getLeaderboardState(beatmapId);
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
            'SELECT COUNT(DISTINCT user_id) AS total FROM event_score WHERE beatmap_id = :beatmapId',
            { replacements: { beatmapId: Number(beatmapId) }, type: QueryTypes.SELECT }
        );
        const rows = await sequelize.query(`${leaderboardCte}
            SELECT ranked_scores.*, u.user_name, u.avatar
            FROM ranked_scores
            JOIN \`user\` AS u ON u.user_id = ranked_scores.user_id
            ORDER BY rank_position ASC
            LIMIT :limit OFFSET :offset`, {
            replacements: {
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
                replacements: { beatmapId: Number(beatmapId), userId: Number(req.user.user_id) },
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
        return res.status(500).json({ message: req.t('score.serverError') });
    }
};

exports.submitBeatmapScore = async (req, res) => {
    const { pack_id: packId, beatmap_id: beatmapId } = req.params;
    const userId = req.user.user_id;

    try {
        const packMap = await findPackMap(packId, beatmapId);
        if (!packMap) return res.status(404).json({ message: req.t('pack.beatmapNotFound') });

        const state = await getLeaderboardState(beatmapId);
        if (state.activeEventId) {
            return res.status(409).json({ message: req.t('pack.submitFromEvent') });
        }
        if (!state.canSubmit) {
            return res.status(403).json({ message: req.t('pack.leaderboardUnavailable') });
        }

        const user = await User.findByPk(userId);
        const scores = await fetchRecentManiaScores(user);
        if (!scores || scores.length === 0) {
            return res.status(400).json({ message: req.t('osuScore.noRecentScore') });
        }
        const bestScores = getBestScoresByBeatmap(scores, [Number(beatmapId)]);
        const score = bestScores.get(Number(beatmapId));
        if (!score) return res.status(400).json({ message: req.t('pack.noRecentBeatmapScore') });

        const result = await upsertBestScore({
            beatmapId: Number(beatmapId),
            eventId: 0,
            score,
            stageId: null,
            userId,
        });
        if (!result.updated) {
            return res.status(400).json({ message: req.t('osuScore.scoreNotHigher') });
        }
        return res.status(200).json({ message: req.t('osuScore.updateSuccess') });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: req.t('osuScore.serverError') });
    }
};

module.exports.getLeaderboardState = getLeaderboardState;
