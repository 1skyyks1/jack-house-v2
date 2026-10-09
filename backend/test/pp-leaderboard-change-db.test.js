const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const sequelize = require('../config/db');
const { select, write } = require('../services/pp/repository');
const { getLeaderboard } = require('../services/pp/query');

test('leaderboard compares only yesterday in the same client and published version', {
    skip: process.env.PP_DB_TEST !== 'true',
}, async () => {
    sequelize.options.logging = false;
    const tx = await sequelize.transaction();
    const keys = [];
    try {
        const users = await select(`SELECT u.user_id FROM \`user\` u
            WHERE NOT EXISTS (SELECT 1 FROM pp_score_attempt a WHERE a.user_id = u.user_id)
              AND NOT EXISTS (SELECT 1 FROM pp_rank_history h WHERE h.user_id = u.user_id)
              AND NOT EXISTS (SELECT 1 FROM pack_score s WHERE s.user_id = u.user_id)
              AND NOT EXISTS (SELECT 1 FROM event_score s WHERE s.user_id = u.user_id)
            ORDER BY u.user_id LIMIT 2`, {}, tx);
        assert.equal(users.length, 2, 'Need two existing users without PP records for rollback testing');
        const maps = await select(`SELECT DISTINCT pm.beatmap_id FROM pack_map pm
            JOIN pack p ON p.pack_id = pm.pack_id
            WHERE p.leaderboard_enabled = 1 AND pm.beatmap_id > 0 LIMIT 2`, {}, tx);
        assert.equal(maps.length, 2);
        const [map, secondMap] = maps;
        const [rule] = await select('SELECT algorithm_version FROM pp_rules WHERE id = 1', {}, tx);
        const [a, b] = users.map((user) => Number(user.user_id));
        for (const [userId, client, pp, beatmapId, score] of [
            [a, 'stable', 1e9, map.beatmap_id, 900000], [b, 'stable', 1e9, map.beatmap_id, 900000],
            [a, 'lazer', 5e8, map.beatmap_id, 900000], [b, 'lazer', 1e9, map.beatmap_id, 900000],
            [a, 'stable', 100, secondMap.beatmap_id, 0], [b, 'stable', 100, secondMap.beatmap_id, 0],
        ]) {
            const key = randomUUID().replaceAll('-', '').padEnd(64, '0');
            keys.push(key);
            await write(`INSERT INTO pp_score_attempt (attempt_key,user_id,beatmap_id,client,passed,score,score_rank,mods)
                VALUES (:key,:userId,:beatmapId,:client,1,:score,:rank,'[]')`,
            { key, userId, beatmapId, client, score, rank: userId === a ? 'XH' : 'X' }, tx);
            await write(`INSERT INTO pp_score_result (attempt_id,algorithm_version,status,pp,stars)
                SELECT id,:version,'ready',:pp,5 FROM pp_score_attempt WHERE attempt_key = :key`,
            { key, version: rule.algorithm_version, pp }, tx);
        }
        // Grades use all recorded best game scores, independently of BP eligibility.
        await write(`INSERT INTO event_score (user_id,event_id,beatmap_id,score,score_rank,mods,build_id) VALUES
            (:a,0,:map,1000000,'S','[]',NULL),
            (:a,0,2140000001,1000000,'X','[]',NULL),
            (:a,1,2140000001,1000000,'SH','[]',123)`, { a, map: map.beatmap_id }, tx);
        await write(`INSERT INTO pp_rank_history
            (user_id,client,algorithm_version,snapshot_date,rank_position,total_pp,recorded_at) VALUES
            (:a,'stable',:version,DATE_SUB(UTC_DATE(),INTERVAL 1 DAY),5,1,UTC_TIMESTAMP()),
            (:b,'stable',:version,DATE_SUB(UTC_DATE(),INTERVAL 1 DAY),1,1,UTC_TIMESTAMP()),
            (:a,'lazer',:version,DATE_SUB(UTC_DATE(),INTERVAL 1 DAY),1,1,UTC_TIMESTAMP()),
            (:a,'stable',:version,UTC_DATE(),777,1,UTC_TIMESTAMP()),
            (:a,'stable',:version,DATE_SUB(UTC_DATE(),INTERVAL 2 DAY),99,1,UTC_TIMESTAMP()),
            (:a,'stable','unpublished-test-version',DATE_SUB(UTC_DATE(),INTERVAL 1 DAY),999,1,UTC_TIMESTAMP())`,
        { a, b, version: rule.algorithm_version }, tx);

        const stable = await getLeaderboard({ client: 'stable', limit: 2, offset: 0 }, tx);
        assert.deepEqual(stable.data.map((row) => [row.user_id, row.rank, row.previous_rank, row.rank_change]),
            [[a, 1, 5, 4], [b, 1, 1, 0]]);
        assert.equal(stable.algorithm_version, rule.algorithm_version);
        assert.deepEqual(stable.data.map(row => row.highest_pp), [1e9, 1e9]);
        assert.ok(stable.data.every(row => row.total_pp > row.highest_pp));
        assert.deepEqual(stable.data[0].grade_counts, { SSH: 0, SS: 1, SH: 0, S: 1, A: 0, B: 0, C: 0, D: 0 });
        assert.deepEqual(stable.data[1].grade_counts, { SSH: 0, SS: 1, SH: 0, S: 0, A: 0, B: 0, C: 0, D: 0 });
        const next = await getLeaderboard({ client: 'stable', limit: 1, offset: 1 }, tx);
        assert.equal(next.total, stable.total);
        assert.deepEqual(next.data, [stable.data[1]]);

        const lazer = await getLeaderboard({ client: 'lazer', limit: 2, offset: 0 }, tx);
        assert.deepEqual(lazer.data.map((row) => [row.user_id, row.rank, row.previous_rank, row.rank_change]),
            [[b, 1, null, null], [a, 2, 1, -1]]);
        assert.deepEqual(lazer.data.map(row => row.highest_pp), [1e9, 5e8]);
        assert.deepEqual(lazer.data[1].grade_counts, { SSH: 1, SS: 0, SH: 1, S: 0, A: 0, B: 0, C: 0, D: 0 });

        await write(`UPDATE pp_rank_history SET rank_position = NULL WHERE user_id = :b
            AND client = 'stable' AND algorithm_version = :version
            AND snapshot_date = DATE_SUB(UTC_DATE(),INTERVAL 1 DAY)`, { b, version: rule.algorithm_version }, tx);
        await write(`DELETE FROM pp_rank_history WHERE user_id = :a AND client = 'stable'
            AND algorithm_version = :version AND snapshot_date = DATE_SUB(UTC_DATE(),INTERVAL 1 DAY)`,
        { a, version: rule.algorithm_version }, tx);
        const missing = await getLeaderboard({ client: 'stable', limit: 2, offset: 0 }, tx);
        assert.ok(missing.data.every((row) => row.previous_rank === null && row.rank_change === null));
    } finally {
        await tx.rollback();
    }
    const remaining = await select('SELECT id FROM pp_score_attempt WHERE attempt_key IN (:keys)', { keys });
    assert.equal(remaining.length, 0, 'Test attempts must never persist');
});

after(() => sequelize.close());
