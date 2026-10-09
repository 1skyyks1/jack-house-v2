const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test, after } = require('node:test');
const sequelize = require('../config/db');
const { select, write } = require('../services/pp/repository');
const { getUserScoreGradeCounts, getUsersScoreGradeCounts } = require('../services/userScoreGradeService');
const { getUserPP } = require('../services/pp/query');

test('all recorded scores count by highest game score per map/client independently of BP eligibility', {
    skip: process.env.PP_DB_TEST !== 'true',
}, async () => {
    sequelize.options.logging = false;
    const tx = await sequelize.transaction();
    try {
        const [user] = await select(`SELECT u.user_id FROM \`user\` u
            WHERE NOT EXISTS (SELECT 1 FROM pp_score_attempt s WHERE s.user_id = u.user_id)
              AND NOT EXISTS (SELECT 1 FROM pack_score s WHERE s.user_id = u.user_id)
              AND NOT EXISTS (SELECT 1 FROM event_score s WHERE s.user_id = u.user_id) LIMIT 1`, {}, tx);
        assert.ok(user, 'Need an existing user without recorded scores for rollback testing');
        const packs = await select('SELECT pack_id FROM pack WHERE leaderboard_enabled = 0 LIMIT 2', {}, tx);
        assert.equal(packs.length, 2);
        const userId = Number(user.user_id);
        const packScore = async (packId, map, score, rank, build = null) => write(`
            INSERT INTO pack_score (user_id,pack_id,beatmap_id,score,score_rank,build_id,mods,updated_time)
            VALUES (:userId,:packId,:map,:score,:rank,:build,'[]','2020-01-01 00:00:00')`,
        { userId, packId, map, score, rank, build }, tx);
        const eventScore = async (map, score, rank, build = null, mods = [], eventId = 0) => write(`
            INSERT INTO event_score (user_id,event_id,beatmap_id,score,score_rank,build_id,mods)
            VALUES (:userId,:eventId,:map,:score,:rank,:build,:mods)`,
        { userId, eventId, map, score, rank, build, mods: JSON.stringify(mods) }, tx);
        const attempt = async (map, score, rank, client = 'stable', passed = 1, mods = []) => write(`
            INSERT INTO pp_score_attempt (attempt_key,user_id,beatmap_id,score,score_rank,client,passed,mods,captured_at)
            VALUES (:key,:userId,:map,:score,:rank,:client,:passed,:mods,'2021-01-01 00:00:00')`,
        { key: randomUUID().replaceAll('-', '').padEnd(64, '0'), userId, map, score, rank, client, passed,
            mods: JSON.stringify(mods) }, tx);

        await packScore(packs[0].pack_id, 2140000001, 900000, 'A');
        await packScore(packs[1].pack_id, 2140000001, 950000, 'S');
        await eventScore(2140000001, 990000, 'XH');
        await eventScore(2140000001, 950000, 'S', null, [], 1);
        await attempt(2140000001, 990000, 'XH'); // Same map captured in multiple sources counts once.
        await packScore(packs[0].pack_id, 2140000004, 750000, 'S', 123);
        await eventScore(2140000001, 900000, 'X', 123, [], 2);
        await eventScore(2140000002, 800000, 'S', null, [{ acronym: 'FI' }]);
        await attempt(2140000003, 600000, 'A', 'stable', 1, [{ acronym: 'SV2' }]);
        await attempt(2140000004, 800000, 'XH', 'lazer', 1, [{ acronym: 'CL' }]);
        await attempt(2140000005, 1000000, 'X', 'stable', 0); // Failed plays are not grades.
        await attempt(2140000005, 1000000, 'X', 'unknown');
        await packScore(packs[0].pack_id, 2140000006, 1000000, null);
        await attempt(2140000006, 900000, 'S'); // Missing grade on the winning score is not guessed.
        await packScore(packs[0].pack_id, 2140000007, 1000000, 'S');
        await attempt(2140000007, 1000000, 'A'); // Equal scores preserve the earlier record.

        const counts = await getUserScoreGradeCounts(userId, tx);
        assert.deepEqual(counts.stable, { SSH: 1, SS: 0, SH: 1, S: 1, A: 1, B: 0, C: 0, D: 0 });
        assert.deepEqual(counts.lazer, { SSH: 1, SS: 1, SH: 0, S: 0, A: 0, B: 0, C: 0, D: 0 });
        const profile = await getUserPP(userId, tx);
        assert.equal(profile.stable.bp_count, 0);
        assert.equal(profile.lazer.bp_count, 0);
        assert.deepEqual(profile.stable.grade_counts, counts.stable);
        assert.deepEqual(profile.lazer.grade_counts, counts.lazer);
        const [other] = await select(`SELECT u.user_id FROM \`user\` u WHERE u.user_id <> :userId
            AND NOT EXISTS (SELECT 1 FROM pp_score_attempt s WHERE s.user_id = u.user_id)
            AND NOT EXISTS (SELECT 1 FROM pack_score s WHERE s.user_id = u.user_id)
            AND NOT EXISTS (SELECT 1 FROM event_score s WHERE s.user_id = u.user_id) LIMIT 1`, { userId }, tx);
        assert.ok(other);
        const otherId = Number(other.user_id);
        await write(`INSERT INTO pp_score_attempt (attempt_key,user_id,beatmap_id,score,score_rank,client,passed,mods)
            VALUES (:key,:otherId,2140000001,1000000,'S','stable',1,'[]')`,
        { key: randomUUID().replaceAll('-', '').padEnd(64, '0'), otherId }, tx);
        const batch = await getUsersScoreGradeCounts([userId, otherId, userId], tx);
        assert.equal(batch.size, 2);
        assert.deepEqual(batch.get(userId), counts);
        assert.deepEqual(batch.get(otherId).stable, { SSH: 0, SS: 0, SH: 0, S: 1, A: 0, B: 0, C: 0, D: 0 });
        assert.equal(batch.get(otherId).lazer.S, 0);
        assert.equal((await getUsersScoreGradeCounts([], tx)).size, 0);
    } finally { await tx.rollback(); }
});

after(() => sequelize.close());
