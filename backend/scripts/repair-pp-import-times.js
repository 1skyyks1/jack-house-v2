const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sequelize = require('../config/db');
const { select, write } = require('../services/pp/repository');
const { canonical } = require('../services/pp/score');

const digest = (rows) => createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex');

async function main() {
    sequelize.options.logging = false;
    try {
        const result = await sequelize.transaction(async (transaction) => {
            const before = await select('SELECT * FROM pack_score ORDER BY id', {}, transaction);
            // Only the initial PP copies with this exact, verified eight-hour offset are repaired.
            // Original pack_score rows are never updated.
            const [count] = await select(`SELECT COUNT(*) AS count FROM pp_score_attempt a
                JOIN pack_score ps ON ps.user_id = a.user_id AND ps.beatmap_id = a.beatmap_id
                AND a.osu_score_id = CAST(ps.osu_score_id AS CHAR)
                WHERE a.score <=> ps.score AND a.build_id <=> ps.build_id
                AND a.played_at = DATE_ADD(ps.played_at, INTERVAL 8 HOUR)`, {}, transaction);
            await write(`UPDATE pp_score_attempt a
                JOIN pack_score ps ON ps.user_id = a.user_id AND ps.beatmap_id = a.beatmap_id
                AND a.osu_score_id = CAST(ps.osu_score_id AS CHAR)
                SET a.played_at = ps.played_at
                WHERE a.score <=> ps.score AND a.build_id <=> ps.build_id
                AND a.played_at = DATE_ADD(ps.played_at, INTERVAL 8 HOUR)`, {}, transaction);
            const after = await select('SELECT * FROM pack_score ORDER BY id', {}, transaction);
            assert.equal(digest(before), digest(after), 'Original scores changed; rolling back');
            return { repairedPpCopies: Number(count.count), originalScoresUnchanged: true, originalScoreCount: after.length };
        });
        console.log(JSON.stringify(result));
    } finally { await sequelize.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
