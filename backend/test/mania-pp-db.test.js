const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const sequelize = require('../config/db');
const { select, write, snapshotScore } = require('../services/pp/repository');
const { ALGORITHM_VERSION, aggregateBps } = require('../services/pp/score');
const query = require('../services/pp/query');

test('MariaDB BP view selects by PP, separates clients, and retains more than 50 maps', {
    skip: process.env.PP_DB_TEST !== 'true',
}, async () => {
    sequelize.options.logging = false;
    const tx = await sequelize.transaction();
    try {
        const [user] = await select(`SELECT u.user_id FROM \`user\` u
            WHERE NOT EXISTS (SELECT 1 FROM pp_score_attempt a WHERE a.user_id = u.user_id)
              AND NOT EXISTS (SELECT 1 FROM pack_score s WHERE s.user_id = u.user_id)
              AND NOT EXISTS (SELECT 1 FROM event_score s WHERE s.user_id = u.user_id) LIMIT 1`, {}, tx);
        assert.ok(user, 'Need an existing user with no PP attempts for isolated rollback testing');
        const maps = await select(`SELECT DISTINCT pm.beatmap_id FROM pack_map pm
            JOIN pack p ON p.pack_id = pm.pack_id WHERE p.leaderboard_enabled = 1 AND pm.beatmap_id > 0 LIMIT 60`, {}, tx);
        assert.equal(maps.length, 60);
        const add = async (beatmapId, client, pp, rawScore, playedAt = null, scoreRank = 'A', mods = []) => {
            const key = randomUUID().replaceAll('-', '').padEnd(64, '0');
            await write(`INSERT INTO pp_score_attempt (attempt_key,user_id,beatmap_id,client,score,passed,played_at,score_rank,mods)
                VALUES (:key,:userId,:beatmapId,:client,:score,1,:playedAt,:scoreRank,:mods)`,
            { key, userId: user.user_id, beatmapId, client, score: rawScore, playedAt, scoreRank, mods: JSON.stringify(mods) }, tx);
            await write(`INSERT INTO pp_score_result (attempt_id,algorithm_version,status,pp,stars)
                SELECT id,:version,'ready',:pp,5 FROM pp_score_attempt WHERE attempt_key = :key`,
            { key, version: ALGORITHM_VERSION, pp }, tx);
        };
        for (let i = 0; i < maps.length; i += 1) await add(maps[i].beatmap_id, 'stable', 1000 - i, 900000);
        await add(maps[0].beatmap_id, 'stable', 500, 1000000, null, 'SS', [{ acronym: 'HD' }]);
        const utc = snapshotScore({ build_id: 123, mods: [], ended_at: '2026-08-30T15:20:51+08:00' }, user.user_id).playedAt;
        await add(maps[0].beatmap_id, 'lazer', 2000, 800000, utc, 'XH');
        const [time] = await select(`SELECT CAST(played_at AS CHAR) AS value FROM pp_score_attempt
            WHERE user_id = :userId AND client = 'lazer'`, { userId: user.user_id }, tx);
        assert.equal(time.value, '2026-08-30 07:20:51');
        const rows = await select('SELECT * FROM pp_best_score WHERE user_id = :userId', { userId: user.user_id }, tx);
        assert.equal(rows.length, 61);
        const stable = rows.filter((row) => row.client === 'stable');
        assert.equal(stable.length, 60);
        assert.equal(Number(stable.find((row) => Number(row.beatmap_id) === Number(maps[0].beatmap_id)).score), 900000);
        const [sqlTotal] = await select(`WITH positions AS (
            SELECT pp, ROW_NUMBER() OVER (ORDER BY pp DESC) AS position FROM pp_best_score
            WHERE user_id = :userId AND client = 'stable'
        ) SELECT SUM(pp * POWER(0.95, position - 1)) AS total FROM positions WHERE position <= 50`,
        { userId: user.user_id }, tx);
        const expected = aggregateBps(rows.map((row) => ({ ...row, pp: Number(row.pp) })));
        assert.ok(Math.abs(Number(sqlTotal.total) - expected.stable.total_pp) < 1e-8);
        assert.equal(expected.lazer.total_pp, 2000);
        const summary = await query.getUserPP(Number(user.user_id), tx);
        assert.equal(summary.stable.counted_bp_count, 50);
        assert.deepEqual(summary.stable.grade_counts, { SSH: 1, SS: 0, SH: 0, S: 0, A: 59, B: 0, C: 0, D: 0 });
        assert.equal(summary.lazer.grade_counts.SSH, 1);
        await write(`UPDATE pp_score_result SET algorithm_version = 'test-unpublished'
            WHERE attempt_id IN (SELECT id FROM pp_score_attempt WHERE user_id = :userId)`, { userId: user.user_id }, tx);
        assert.equal((await select('SELECT * FROM pp_best_score WHERE user_id = :userId', { userId: user.user_id }, tx)).length, 0);
        assert.deepEqual((await query.getUserPP(Number(user.user_id), tx)).stable.grade_counts, summary.stable.grade_counts);
    } finally { await tx.rollback(); }
});

test('live result totals and HTTP endpoints match independently aggregated BPs', {
    skip: process.env.PP_DB_TEST !== 'true',
}, async () => {
    sequelize.options.logging = false;
    const rows = await select('SELECT * FROM pp_best_score ORDER BY user_id, client, pp DESC');
    assert.ok(rows.length > 0, 'Run the PP backfill first');
    const users = [...new Set(rows.map((row) => Number(row.user_id)))];
    for (const userId of users) {
        const expected = aggregateBps(rows.filter((row) => Number(row.user_id) === userId).map((row) => ({ ...row, pp: Number(row.pp) })));
        const actual = await query.getUserPP(userId);
        for (const client of ['stable', 'lazer']) {
            assert.ok(Math.abs(actual[client].total_pp - expected[client].total_pp) < 1e-8);
            assert.equal(actual[client].bp_count, expected[client].bp_count);
        }
    }
    const express = require('express');
    const controller = require('../controllers/ppController');
    const app = express();
    app.get('/user/:user_id/pp', controller.getUserPP);
    app.get('/user/:user_id/pp/best', controller.getBestPlays);
    app.use('/pp', require('../routes/ppRoute'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const get = (path) => fetch(base + path);
        for (const client of ['stable', 'lazer']) {
            const leaderboard = await get(`/pp/leaderboard?client=${client}`);
            assert.equal(leaderboard.status, 200);
            const result = await leaderboard.json();
            assert.ok(result.total > 0);
            assert.ok(result.data.every((row) => row.client === client && row.total_pp >= 0));
            const best = await get(`/user/${users[0]}/pp/best?client=${client}&pageSize=2`);
            assert.equal(best.status, 200);
            assert.ok((await best.json()).data.length <= 2);
            assert.equal((await get(`/pp/beatmaps/${rows[0].beatmap_id}/leaderboard?client=${client}`)).status, 200);
        }
        const profile = await get(`/user/${users[0]}/pp`);
        assert.equal(profile.status, 200);
        assert.ok((await profile.json()).data.stable);
        assert.equal((await get('/pp/leaderboard?client=combined')).status, 400);
        assert.equal((await get('/user/invalid/pp')).status, 400);
        assert.equal((await get('/user/2147483647/pp')).status, 404);
    } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('PP capture is immutable and idempotent on repeated sync (rolled back)', {
    skip: process.env.PP_DB_TEST !== 'true',
}, async () => {
    sequelize.options.logging = false;
    const tx = await sequelize.transaction();
    try {
        const [row] = await select(`SELECT * FROM pp_score_attempt
            WHERE osu_score_id IS NOT NULL AND passed = 1 AND client IN ('stable', 'lazer')
            ORDER BY id LIMIT 1`, {}, tx);
        assert.ok(row, 'Run the PP backfill first');
        const { captureScores } = require('../services/pp/repository');
        const raw = { ...row, id: row.osu_score_id, statistics: row.statistics, mods: row.mods,
            ended_at: row.played_at, passed: true };
        const before = await select('SELECT * FROM pp_score_attempt ORDER BY id', {}, tx);
        const key = snapshotScore(raw, row.user_id).attemptKey;
        assert.equal(key, row.attempt_key);
        await captureScores({ userId: row.user_id, scores: [raw] }, { transaction: tx });
        await captureScores({ userId: row.user_id,
            scores: [{ ...raw, score: 1, legacy_total_score: 1, total_score: 1 }] }, { transaction: tx });
        const after = await select('SELECT * FROM pp_score_attempt ORDER BY id', {}, tx);
        assert.deepEqual(after, before, 'Repeated sync must not overwrite or duplicate score snapshots');
    } finally { await tx.rollback(); }
});

require('node:test').after(() => sequelize.close());
