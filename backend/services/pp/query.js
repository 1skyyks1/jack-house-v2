const { select } = require('./repository');
const { parseJson } = require('./score');
const { getUserScoreGradeCounts, getUsersScoreGradeCounts } = require('../userScoreGradeService');

const rankingsCte = `WITH ordered_bps AS (
    SELECT bp.*, ROW_NUMBER() OVER (
        PARTITION BY bp.user_id, bp.client ORDER BY bp.pp DESC, bp.beatmap_id ASC
    ) AS bp_position FROM pp_best_score bp
), user_totals AS (
    SELECT bp.user_id, bp.client, COUNT(*) AS bp_count, MAX(bp.pp) AS highest_pp,
           LEAST(COUNT(*), rules.top_count) AS counted_bp_count,
           SUM(CASE WHEN bp.bp_position <= rules.top_count
               THEN bp.pp * POWER(rules.decay, bp.bp_position - 1) ELSE 0 END) AS total_pp
    FROM ordered_bps bp CROSS JOIN pp_rules rules
    WHERE rules.id = 1 GROUP BY bp.user_id, bp.client, rules.top_count
), ranked_users AS (
    SELECT totals.*, RANK() OVER (PARTITION BY client ORDER BY total_pp DESC) AS rank_position
    FROM user_totals totals
)`;

const mapSummary = (row) => ({
    total_pp: Number(row?.total_pp || 0), bp_count: Number(row?.bp_count || 0),
    counted_bp_count: Number(row?.counted_bp_count || 0), rank: row ? Number(row.rank_position) : null,
});
const mapPlay = (row) => ({
    attempt_id: String(row.id), user_id: Number(row.user_id), beatmap_id: Number(row.beatmap_id),
    client: row.client, is_lazer: row.client === 'lazer', osu_score_id: row.osu_score_id,
    pp: Number(row.pp), stars: Number(row.stars), clock_rate: Number(row.clock_rate),
    score: row.score == null ? null : Number(row.score), accuracy: row.accuracy == null ? null : Number(row.accuracy),
    max_combo: row.max_combo == null ? null : Number(row.max_combo), score_rank: row.score_rank,
    statistics: parseJson(row.statistics), mods: parseJson(row.mods), played_at: row.played_at,
    source_checksum: row.source_checksum, source_verified: Boolean(row.source_verified),
    algorithm_version: row.algorithm_version,
    ...(row.bp_position != null ? {
        bp_position: Number(row.bp_position), weight: Number(row.weight), weighted_pp: Number(row.weighted_pp),
    } : {}),
    ...(row.rank_position != null ? { rank: Number(row.rank_position) } : {}),
    ...(row.user_name != null ? { user: { user_name: row.user_name, avatar: row.avatar } } : {}),
    ...(row.pack_id != null ? { beatmap: { pack_id: Number(row.pack_id),
        osu_bid: row.osu_bid == null ? null : Number(row.osu_bid), title: row.title,
        artist: row.artist, creator: row.creator, version: row.version } } : {}),
});

async function rules(transaction) {
    const [row] = await select('SELECT * FROM pp_rules WHERE id = 1', {}, transaction);
    if (!row) throw new Error('pp_rules_missing');
    return { algorithm_version: row.algorithm_version, top_count: Number(row.top_count), decay: Number(row.decay) };
}

async function getUserPP(userId, transaction) {
    const rows = await select(`${rankingsCte} SELECT * FROM ranked_users WHERE user_id = :userId`, { userId }, transaction);
    const queue = await select(`SELECT r.status, COUNT(*) AS count FROM pp_score_result r
        JOIN pp_score_attempt a ON a.id = r.attempt_id
        JOIN pp_rules rules ON rules.id = 1 AND rules.algorithm_version = r.algorithm_version
        WHERE a.user_id = :userId AND EXISTS (
            SELECT 1 FROM pack_map pm JOIN pack p ON p.pack_id = pm.pack_id
            WHERE pm.beatmap_id = a.beatmap_id AND p.leaderboard_enabled = 1
        ) GROUP BY r.status`, { userId }, transaction);
    const grades = await getUserScoreGradeCounts(userId, transaction);
    return { user_id: userId, ...(await rules(transaction)),
        stable: { ...mapSummary(rows.find((row) => row.client === 'stable')), grade_counts: grades.stable },
        lazer: { ...mapSummary(rows.find((row) => row.client === 'lazer')), grade_counts: grades.lazer },
        calculation: Object.fromEntries(['pending', 'processing', 'ready', 'excluded', 'failed'].map((status) => [
            status, Number(queue.find((row) => row.status === status)?.count || 0),
        ])),
    };
}

async function getBestPlays({ userId, client, limit, offset }) {
    const rows = await select(`${rankingsCte}
        SELECT bp.*, IF(bp.bp_position <= rules.top_count, POWER(rules.decay, bp.bp_position - 1), 0) AS weight,
               bp.pp * IF(bp.bp_position <= rules.top_count, POWER(rules.decay, bp.bp_position - 1), 0) AS weighted_pp,
               pm.pack_id, pm.version, p.osu_bid, p.title, p.artist, p.creator
        FROM ordered_bps bp CROSS JOIN pp_rules rules
        JOIN pack_map pm ON pm.map_id = (
            SELECT MIN(candidate.map_id) FROM pack_map candidate
            JOIN pack pool ON pool.pack_id = candidate.pack_id AND pool.leaderboard_enabled = 1
            WHERE candidate.beatmap_id = bp.beatmap_id
        ) JOIN pack p ON p.pack_id = pm.pack_id
        WHERE rules.id = 1 AND bp.user_id = :userId AND bp.client = :client
        ORDER BY bp.bp_position LIMIT :limit OFFSET :offset`, { userId, client, limit, offset });
    const [count] = await select('SELECT COUNT(*) AS total FROM pp_best_score WHERE user_id = :userId AND client = :client', { userId, client });
    return { data: rows.map(mapPlay), total: Number(count.total), ...(await rules()) };
}

async function getLeaderboard({ client, limit, offset }, transaction) {
    const rows = await select(`${rankingsCte} SELECT ranked.*, u.user_name, u.avatar,
               yesterday.rank_position AS previous_rank
        FROM ranked_users ranked JOIN \`user\` u ON u.user_id = ranked.user_id
        CROSS JOIN pp_rules rules
        LEFT JOIN pp_rank_history yesterday ON yesterday.user_id = ranked.user_id
            AND yesterday.client = ranked.client AND yesterday.algorithm_version = rules.algorithm_version
            AND yesterday.snapshot_date = DATE_SUB(UTC_DATE(), INTERVAL 1 DAY)
        WHERE rules.id = 1 AND ranked.client = :client ORDER BY ranked.total_pp DESC, ranked.user_id
        LIMIT :limit OFFSET :offset`, { client, limit, offset }, transaction);
    const [count] = await select('SELECT COUNT(DISTINCT user_id) AS total FROM pp_best_score WHERE client = :client', { client }, transaction);
    const grades = await getUsersScoreGradeCounts(rows.map(row => row.user_id), transaction);
    return { data: rows.map((row) => ({ user_id: Number(row.user_id), client, ...mapSummary(row),
        highest_pp: Number(row.highest_pp), grade_counts: grades.get(Number(row.user_id))[client],
        previous_rank: row.previous_rank == null ? null : Number(row.previous_rank),
        rank_change: row.previous_rank == null ? null : Number(row.previous_rank) - Number(row.rank_position),
        user: { user_name: row.user_name, avatar: row.avatar } })), total: Number(count.total), ...(await rules(transaction)) };
}

async function getBeatmapLeaderboard({ beatmapId, client, limit, offset }) {
    const rows = await select(`WITH ranked AS (
        SELECT bp.*, RANK() OVER (ORDER BY pp DESC) AS rank_position FROM pp_best_score bp
        WHERE beatmap_id = :beatmapId AND client = :client
    ) SELECT ranked.*, u.user_name, u.avatar FROM ranked
    JOIN \`user\` u ON u.user_id = ranked.user_id
    ORDER BY ranked.pp DESC, ranked.user_id LIMIT :limit OFFSET :offset`, { beatmapId, client, limit, offset });
    const [count] = await select('SELECT COUNT(*) AS total FROM pp_best_score WHERE beatmap_id = :beatmapId AND client = :client', { beatmapId, client });
    return { data: rows.map(mapPlay), total: Number(count.total), ...(await rules()) };
}

async function getRankHistory({ userId, client }, transaction) {
    const rows = await select(`SELECT CAST(h.snapshot_date AS CHAR) AS date, h.rank_position, h.total_pp,
        h.recorded_at FROM pp_rank_history h
        JOIN pp_rules rules ON rules.id = 1 AND rules.algorithm_version = h.algorithm_version
        WHERE h.user_id = :userId AND h.client = :client
          AND h.snapshot_date >= DATE_SUB(UTC_DATE(), INTERVAL 89 DAY)
        ORDER BY h.snapshot_date`, { userId, client }, transaction);
    return { user_id: userId, client, ...(await rules(transaction)), days: 90,
        history: rows.map((row) => ({ date: row.date, rank: row.rank_position == null ? null : Number(row.rank_position),
            total_pp: Number(row.total_pp), recorded_at: row.recorded_at })) };
}

module.exports = { getUserPP, getBestPlays, getLeaderboard, getBeatmapLeaderboard, getRankHistory, rankingsCte };
