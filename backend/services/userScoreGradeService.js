const { select } = require('./pp/repository');
const { countGrades } = require('./pp/gradeStats');

async function getUsersScoreGradeCounts(userIds, transaction) {
    const ids = [...new Set(userIds.map(Number))].filter(id => Number.isSafeInteger(id) && id > 0);
    if (!ids.length) return new Map();
    // Original score tables retain the highest game score in their scope. Merge
    // their scopes and captured attempts so each client keeps one score per map.
    const rows = await select(`WITH recorded_scores AS (
        SELECT user_id, beatmap_id, IF(build_id > 0, 'lazer', 'stable') AS client,
               score, score_rank, mods, updated_time AS recorded_at, 0 AS source_order, id
        FROM pack_score WHERE user_id IN (:userIds)
        UNION ALL
        SELECT user_id, beatmap_id, IF(build_id > 0, 'lazer', 'stable') AS client,
               score, score_rank, mods, updated_time AS recorded_at, 1 AS source_order, id
        FROM event_score WHERE user_id IN (:userIds)
        UNION ALL
        SELECT user_id, beatmap_id, client, score, score_rank, mods,
               captured_at AS recorded_at, 2 AS source_order, id
        FROM pp_score_attempt
        WHERE user_id IN (:userIds) AND passed = 1 AND client IN ('stable', 'lazer')
    ), best_scores AS (
        SELECT user_id, client, score_rank, mods, ROW_NUMBER() OVER (
            PARTITION BY user_id, client, beatmap_id
            ORDER BY score DESC, recorded_at ASC, source_order ASC, id ASC
        ) AS score_position
        FROM recorded_scores WHERE beatmap_id > 0 AND score > 0
    ) SELECT user_id, client, score_rank, mods FROM best_scores WHERE score_position = 1`,
    { userIds: ids }, transaction);
    const byUser = new Map(ids.map(id => [id, []]));
    for (const row of rows) byUser.get(Number(row.user_id)).push(row);
    return new Map([...byUser].map(([id, scores]) => [id, countGrades(scores)]));
}

async function getUserScoreGradeCounts(userId, transaction) {
    return (await getUsersScoreGradeCounts([userId], transaction)).get(Number(userId)) || countGrades([]);
}

module.exports = { getUserScoreGradeCounts, getUsersScoreGradeCounts };
