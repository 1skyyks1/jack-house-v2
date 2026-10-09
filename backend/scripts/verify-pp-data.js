const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sequelize = require('../config/db');
const { ALGORITHM_VERSION, canonical, parseJson } = require('../services/pp/score');
const { snapshotScore } = require('../services/pp/repository');

async function main() {
    const connection = await sequelize.connectionManager.getConnection();
    try {
        // Every query uses this connection's read-only transaction, including the audit itself.
        await connection.query('START TRANSACTION READ ONLY');
        const tables = await connection.query(`SELECT TABLE_NAME AS name, TABLE_TYPE AS type
            FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN ('pp_rules','pp_beatmap_source','pp_score_attempt','pp_score_result','pp_difficulty','pp_best_score')`);
        assert.equal(tables.filter((row) => row.type === 'BASE TABLE').length, 5, 'Missing PP tables');
        assert.equal(tables.filter((row) => row.type === 'VIEW').length, 1, 'Missing BP view');
        const [rules] = await connection.query('SELECT * FROM pp_rules WHERE id = 1');
        assert.equal(rules.algorithm_version, ALGORITHM_VERSION, 'Unexpected published PP version');
        assert.equal(Number(rules.top_count), 50);
        assert.equal(Number(rules.decay), 0.95);

        const scores = await connection.query(`SELECT ps.* FROM pack_score ps
            JOIN pack p ON p.pack_id = ps.pack_id WHERE p.leaderboard_enabled = 1 ORDER BY ps.id`);
        const attempts = await connection.query('SELECT * FROM pp_score_attempt');
        const byKey = new Map(attempts.map((row) => [row.attempt_key, row]));
        let timeMismatches = 0;
        for (const row of scores) {
            const input = { ...row, id: row.osu_score_id, ended_at: row.played_at,
                statistics: parseJson(row.statistics), mods: parseJson(row.mods), passed: true };
            const saved = byKey.get(snapshotScore(input, Number(row.user_id)).attemptKey);
            assert.ok(saved, 'An existing featured score is missing its PP snapshot');
            for (const field of ['score', 'max_combo', 'build_id', 'osu_score_id']) {
                assert.equal(String(saved[field] ?? ''), String(row[field] ?? ''), `Score snapshot differs: ${field}`);
            }
            for (const field of ['statistics', 'mods']) {
                assert.deepEqual(canonical(parseJson(saved[field])), canonical(parseJson(row[field])), `Score snapshot differs: ${field}`);
            }
            if ((saved.played_at?.getTime() ?? null) !== (row.played_at?.getTime() ?? null)) timeMismatches += 1;
        }
        if (!process.argv.includes('--allow-time-offset')) assert.equal(timeMismatches, 0, 'Score snapshot differs: played_at');
        const [duplicates] = await connection.query(`SELECT COUNT(*) AS count FROM (
            SELECT user_id, beatmap_id, client FROM pp_best_score
            GROUP BY user_id, beatmap_id, client HAVING COUNT(*) > 1
        ) conflicting`);
        assert.equal(Number(duplicates.count), 0, 'Duplicate BPs found');
        const [missingSources] = await connection.query(`SELECT COUNT(*) AS count FROM pp_score_result r
            LEFT JOIN pp_beatmap_source s ON s.checksum = r.source_checksum
            WHERE r.status = 'ready' AND (s.checksum IS NULL OR r.pp IS NULL OR r.stars IS NULL)`);
        assert.equal(Number(missingSources.count), 0, 'A ready result has missing calculation inputs');
        const states = await connection.query(`SELECT status, COUNT(*) AS count FROM pp_score_result
            WHERE algorithm_version = ? GROUP BY status`, [ALGORITHM_VERSION]);
        const bps = await connection.query('SELECT client, COUNT(*) AS count FROM pp_best_score GROUP BY client');
        const rowCounts = {};
        for (const name of ['pack', 'pack_map', 'pack_score', 'event_score', 'user']) {
            const [row] = await connection.query(`SELECT COUNT(*) AS count FROM \`${name}\``);
            rowCounts[name] = Number(row.count);
        }
        // Only a digest is emitted; no player identities or detailed score data are printed.
        const digest = createHash('sha256').update(JSON.stringify(canonical(scores),
            (_key, value) => typeof value === 'bigint' ? String(value) : value)).digest('hex');
        console.log(JSON.stringify({ readOnly: true, schemaVerified: true, originalRowCounts: rowCounts,
            featuredScores: scores.length, matchingSnapshots: scores.length, timeMismatches, featuredScoreDigest: digest,
            results: states.map((row) => ({ status: row.status, count: Number(row.count) })),
            bps: bps.map((row) => ({ client: row.client, count: Number(row.count) })) }, null, 2));
    } finally {
        await connection.query('ROLLBACK');
        await sequelize.connectionManager.releaseConnection(connection);
        await sequelize.close();
    }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
