const sequelize = require('../config/db');

const MIN_PACK_RANK_RATING = 0.5;

const isPackRankEligibleMap = (map) => Number(map?.beatmap_id) > 0
    && Number(map?.rating) >= MIN_PACK_RANK_RATING;

const backfillPackScoresFromEvents = async (packId, options = {}) => {
    const queryOptions = {
        replacements: { minRankRating: MIN_PACK_RANK_RATING, packId: Number(packId) },
        ...(options.transaction ? { transaction: options.transaction } : {}),
    };

    return sequelize.query(`
        INSERT INTO pack_score (
            pack_id, beatmap_id, user_id, score, accuracy, max_combo, score_rank,
            statistics, mods, build_id, osu_score_id, played_at, created_time, updated_time
        )
        SELECT :packId, ranked.beatmap_id, ranked.user_id, ranked.score, ranked.accuracy,
               ranked.max_combo, ranked.score_rank, ranked.statistics, ranked.mods,
               ranked.build_id, ranked.osu_score_id, ranked.played_at,
               ranked.created_time, ranked.updated_time
        FROM (
            SELECT es.*,
                   ROW_NUMBER() OVER (
                       PARTITION BY es.user_id, es.beatmap_id
                       ORDER BY es.score DESC, es.updated_time ASC, es.id ASC
                   ) AS score_row
            FROM event_score es
            JOIN event_stage stage
              ON stage.id = es.stage_id
             AND stage.event_id = es.event_id
             AND stage.map_id = es.beatmap_id
            JOIN pack_map pm
              ON pm.pack_id = :packId
             AND pm.beatmap_id = es.beatmap_id
             AND pm.rating >= :minRankRating
            WHERE es.event_id > 0
        ) ranked
        WHERE ranked.score_row = 1
        ON DUPLICATE KEY UPDATE
            accuracy = IF(VALUES(score) > pack_score.score, VALUES(accuracy), pack_score.accuracy),
            max_combo = IF(VALUES(score) > pack_score.score, VALUES(max_combo), pack_score.max_combo),
            score_rank = IF(VALUES(score) > pack_score.score, VALUES(score_rank), pack_score.score_rank),
            statistics = IF(VALUES(score) > pack_score.score, VALUES(statistics), pack_score.statistics),
            mods = IF(VALUES(score) > pack_score.score, VALUES(mods), pack_score.mods),
            build_id = IF(VALUES(score) > pack_score.score, VALUES(build_id), pack_score.build_id),
            osu_score_id = IF(VALUES(score) > pack_score.score, VALUES(osu_score_id), pack_score.osu_score_id),
            played_at = IF(VALUES(score) > pack_score.score, VALUES(played_at), pack_score.played_at),
            updated_time = IF(VALUES(score) > pack_score.score, VALUES(updated_time), pack_score.updated_time),
            score = GREATEST(pack_score.score, VALUES(score))
    `, queryOptions);
};

module.exports = {
    MIN_PACK_RANK_RATING,
    backfillPackScoresFromEvents,
    isPackRankEligibleMap,
};
