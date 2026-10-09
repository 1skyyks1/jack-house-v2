const sequelize = require('../config/db');
const { ALGORITHM_VERSION } = require('../services/pp/score');
const { backfillScores, select, write } = require('../services/pp/repository');
const { processBatch, closeComputeWorker } = require('../services/pp/worker');

async function main() {
    // Operational commands log counts only; never log raw statistics, identities or DB credentials.
    sequelize.options.logging = false;
    const command = process.argv[2];
    if (command === 'backfill') console.log(`Captured ${await backfillScores()} existing featured score records.`);
    else if (command === 'retry') {
        await write(`UPDATE pp_score_result SET status = 'pending', tries = 0, retry_at = NOW(), reason = NULL
            WHERE algorithm_version = :version AND status IN ('failed', 'pending')`, { version: ALGORITHM_VERSION });
        console.log('Retryable PP jobs queued.');
    } else if (command === 'recalculate') {
        // Staging a new engine version preserves the currently published leaderboard.
        await write(`INSERT IGNORE INTO pp_score_result (attempt_id, algorithm_version)
            SELECT id, :version FROM pp_score_attempt`, { version: ALGORITHM_VERSION });
        console.log('All attempts queued for this engine version; existing results are unchanged.');
    } else if (command === 'publish') {
        await sequelize.transaction(async (transaction) => {
            await select('SELECT id FROM pp_rules WHERE id = 1 FOR UPDATE', {}, transaction);
            const [row] = await select(`SELECT COUNT(*) AS incomplete FROM pp_score_attempt a
                LEFT JOIN pp_score_result r ON r.attempt_id = a.id AND r.algorithm_version = :version
                WHERE r.status IS NULL OR r.status NOT IN ('ready', 'excluded')`, { version: ALGORITHM_VERSION }, transaction);
            if (Number(row.incomplete)) throw new Error('Cannot publish: some attempts still need calculation or retry.');
            await write('UPDATE pp_rules SET algorithm_version = :version WHERE id = 1', { version: ALGORITHM_VERSION }, transaction);
        });
        console.log(`Published ${ALGORITHM_VERSION}.`);
    } else if (!['work', 'drain'].includes(command)) throw new Error('Usage: pp.js backfill|retry|recalculate|publish|work|drain');

    if (['backfill', 'drain', 'work'].includes(command)) {
        for (;;) {
            const result = await processBatch();
            if (result.processed) console.log(JSON.stringify(result));
            if (!result.processed && command !== 'work') break;
            if (!result.processed) await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
    const rows = await select(`SELECT status, COUNT(*) AS count FROM pp_score_result
        WHERE algorithm_version = :version GROUP BY status`, { version: ALGORITHM_VERSION });
    console.log(JSON.stringify(rows.map((row) => ({ status: row.status, count: Number(row.count) }))));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => { closeComputeWorker(); return sequelize.close(); });
