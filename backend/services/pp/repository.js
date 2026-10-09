const { QueryTypes } = require('sequelize');
const sequelize = require('../../config/db');
const { getScoreDetails, getPlayedAt, getScoreValue, getOsuScoreId } = require('../beatmapScoreService');
const { ALGORITHM_VERSION, clientOf, hash, parseJson } = require('./score');

const select = (sql, replacements = {}, transaction) => sequelize.query(sql, {
    replacements, type: QueryTypes.SELECT, logging: false, ...(transaction ? { transaction } : {}),
});
const write = (sql, replacements = {}, transaction) => sequelize.query(sql, {
    replacements, logging: false, ...(transaction ? { transaction } : {}),
});

async function featuredBeatmapIds(transaction) {
    const rows = await select(`SELECT DISTINCT pm.beatmap_id FROM pack_map pm
        JOIN pack p ON p.pack_id = pm.pack_id
        WHERE p.leaderboard_enabled = 1 AND pm.beatmap_id > 0`, {}, transaction);
    return new Set(rows.map((row) => Number(row.beatmap_id)));
}

function snapshotScore(raw, userId) {
    const client = clientOf(raw);
    const beatmapId = Number(raw.beatmap_id ?? raw.beatmap?.id);
    const id = getOsuScoreId(raw);
    const details = getScoreDetails(raw);
    const statistics = parseJson(raw.statistics);
    const mods = parseJson(raw.mods);
    const playedAt = getPlayedAt(raw);
    const reportedChecksum = raw.beatmap_checksum ?? raw.beatmap?.checksum;
    // A score ID is immutable. Missing IDs use a stable fingerprint, never the local pack ID.
    const attemptKey = hash(id ? [userId, client, id] : [userId, client, beatmapId, playedAt, statistics, mods, getScoreValue(raw)]);
    return {
        attemptKey, userId, beatmapId, client, osuScoreId: id,
        buildId: details.build_id, score: getScoreValue(raw), accuracy: details.accuracy,
        maxCombo: details.max_combo, scoreRank: details.score_rank,
        statistics: statistics == null ? null : JSON.stringify(statistics),
        mods: mods == null ? null : JSON.stringify(mods), passed: raw.passed === true ? 1 : 0,
        // Raw Sequelize replacements escape Dates using the host timezone in this dialect.
        // Supply explicit UTC text so DATETIME snapshots preserve the original instant.
        playedAt: playedAt ? playedAt.toISOString().slice(0, 23).replace('T', ' ') : null,
        checksum: typeof reportedChecksum === 'string' && /^[a-f0-9]{32}$/i.test(reportedChecksum)
            ? reportedChecksum.toLowerCase() : null,
    };
}

async function captureScores({ scores, userId, beatmapIds }, { transaction } = {}) {
    const capture = async (tx) => {
        await select('SELECT id FROM pp_rules WHERE id = 1 LOCK IN SHARE MODE', {}, tx);
        const featured = await featuredBeatmapIds(tx);
        const scope = beatmapIds ? new Set([...beatmapIds].map(Number)) : featured;
        const unique = new Map();
        for (const raw of scores || []) {
            const beatmapId = Number(raw.beatmap_id ?? raw.beatmap?.id);
            if (!featured.has(beatmapId) || !scope.has(beatmapId)) continue;
            const snapshot = snapshotScore(raw, Number(userId));
            unique.set(snapshot.attemptKey, snapshot);
        }
        for (const snapshot of [...unique.values()].sort((a, b) => a.attemptKey.localeCompare(b.attemptKey))) {
            await write(`INSERT INTO pp_score_attempt
                (attempt_key, user_id, beatmap_id, client, osu_score_id, build_id, score,
                 accuracy, max_combo, score_rank, statistics, mods, passed, played_at, reported_checksum)
                VALUES (:attemptKey, :userId, :beatmapId, :client, :osuScoreId, :buildId, :score,
                        :accuracy, :maxCombo, :scoreRank, :statistics, :mods, :passed, :playedAt, :checksum)
                ON DUPLICATE KEY UPDATE id = id`, snapshot, tx);
            await write(`INSERT IGNORE INTO pp_score_result (attempt_id, algorithm_version)
                SELECT id, :version FROM pp_score_attempt WHERE attempt_key = :attemptKey`,
            { version: ALGORITHM_VERSION, attemptKey: snapshot.attemptKey }, tx);
        }
        return { candidates: unique.size, algorithm_version: ALGORITHM_VERSION, asynchronous: true };
    };
    return transaction ? capture(transaction) : sequelize.transaction(capture);
}

async function backfillScores({ packId } = {}) {
    // Cursor pages bound memory and transaction duration for larger installations.
    let cursor = 0;
    let count = 0;
    for (;;) {
        const rows = await select(`SELECT ps.* FROM pack_score ps
            JOIN pack p ON p.pack_id = ps.pack_id AND p.leaderboard_enabled = 1
            WHERE ps.id > :cursor ${packId ? 'AND ps.pack_id = :packId' : ''}
            ORDER BY ps.id LIMIT 100`, { cursor, packId: Number(packId || 0) });
        if (!rows.length) break;
        for (const row of rows) {
            await captureScores({ userId: row.user_id, scores: [{
                ...row, id: row.osu_score_id, statistics: parseJson(row.statistics), mods: parseJson(row.mods),
                ended_at: row.played_at, passed: true,
            }] });
            count += 1;
        }
        cursor = rows[rows.length - 1].id;
    }
    return count;
}

async function capturePackScores(packId, { transaction } = {}) {
    const rows = await select('SELECT * FROM pack_score WHERE pack_id = :packId', { packId: Number(packId) }, transaction);
    const users = new Map();
    for (const row of rows) {
        const scores = users.get(row.user_id) || [];
        scores.push({ ...row, id: row.osu_score_id, statistics: parseJson(row.statistics),
            mods: parseJson(row.mods), ended_at: row.played_at, passed: true });
        users.set(row.user_id, scores);
    }
    for (const [userId, scores] of users) await captureScores({ userId, scores }, { transaction });
}

module.exports = { select, write, featuredBeatmapIds, snapshotScore, captureScores, backfillScores, capturePackScores };
