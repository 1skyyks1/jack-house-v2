const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const sequelize = require('../config/db');
const { select, write, snapshotScore } = require('../services/pp/repository');
const { recordRankHistory } = require('../services/pp/rankHistory');
const { rankingsCte, getRankHistory } = require('../services/pp/query');

test('rank snapshots match current rankings, preserve dates and isolate rule versions', {
    skip: process.env.PP_DB_TEST !== 'true',
}, async () => {
    sequelize.options.logging = false;
    const tx = await sequelize.transaction();
    try {
        const rankings = await select(`${rankingsCte} SELECT * FROM ranked_users`, {}, tx);
        await recordRankHistory(tx);
        const [before] = await select('SELECT COUNT(*) AS n FROM pp_rank_history', {}, tx);
        await recordRankHistory(tx);
        const [after] = await select('SELECT COUNT(*) AS n FROM pp_rank_history', {}, tx);
        assert.equal(Number(before.n), Number(after.n));
        for (const rank of rankings) {
            const history = await getRankHistory({ userId: Number(rank.user_id), client: rank.client }, tx);
            const latest = history.history.at(-1);
            assert.equal(latest.rank, Number(rank.rank_position));
            assert.ok(Math.abs(latest.total_pp - Number(rank.total_pp)) < 1e-8);
        }
        const example = rankings[0];
        assert.ok(example, 'Run the PP backfill first');
        const [rule] = await select('SELECT algorithm_version FROM pp_rules WHERE id = 1', {}, tx);
        await write(`INSERT INTO pp_rank_history
            (user_id,client,algorithm_version,snapshot_date,rank_position,total_pp,recorded_at)
            VALUES (:id,:client,:version,DATE_SUB(UTC_DATE(),INTERVAL 1 DAY),99,1,UTC_TIMESTAMP()),
                   (:id,:client,'unpublished-test-version',UTC_DATE(),999,1,UTC_TIMESTAMP()),
                   (:id,:client,:version,DATE_SUB(UTC_DATE(),INTERVAL 90 DAY),98,1,UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE rank_position = VALUES(rank_position), total_pp = VALUES(total_pp)`,
        { id: example.user_id, client: example.client, version: rule.algorithm_version }, tx);
        const history = await getRankHistory({ userId: Number(example.user_id), client: example.client }, tx);
        assert.equal(history.history.at(-2).rank, 99);
        assert.ok(history.history.every((point) => point.rank !== 999 && point.rank !== 98));
    } finally { await tx.rollback(); }
});

test('real recent score PP resolves exact published attempts', {
    skip: process.env.PP_DB_TEST !== 'true',
}, async () => {
    sequelize.options.logging = false;
    const { listUserRecentScores } = require('../services/userRecentScoreService');
    const users = await select('SELECT DISTINCT user_id FROM pp_score_attempt');
    let checked = 0;
    for (const user of users) {
        const recent = await listUserRecentScores(Number(user.user_id), { limit: 50 });
        for (const score of recent.data) {
            const [raw] = await select('SELECT * FROM pack_score WHERE id = :id', { id: score.id });
            const snapshot = snapshotScore({ ...raw, id: raw.osu_score_id,
                ended_at: raw.played_at, passed: true }, Number(user.user_id));
            const [expected] = await select(`SELECT r.status, r.pp FROM pp_score_attempt a
                JOIN pp_score_result r ON r.attempt_id = a.id
                JOIN pp_rules rules ON rules.id = 1 AND rules.algorithm_version = r.algorithm_version
                WHERE a.attempt_key = :key`, { key: snapshot.attemptKey });
            assert.equal(score.pp_status, expected?.status ?? 'unavailable');
            if (expected?.status === 'ready') {
                assert.ok(Number.isFinite(score.pp));
                assert.equal(score.pp, Number(expected.pp));
            } else assert.equal(score.pp, null);
            checked += 1;
        }
    }
    assert.ok(checked > 0);
});

after(() => sequelize.close());
