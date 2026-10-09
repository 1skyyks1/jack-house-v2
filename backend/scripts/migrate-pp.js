const fs = require('node:fs/promises');
const path = require('node:path');
const sequelize = require('../config/db');
const { select } = require('../services/pp/repository');

async function main() {
    try {
        for (const file of ['2026-10-08-mania-pp.sql', '2026-10-08-pp-rank-history.sql']) {
            const sql = await fs.readFile(path.join(__dirname, '../sql', file), 'utf8');
            for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
                await sequelize.query(statement, { logging: false });
            }
        }
        const rows = await select(`SELECT TABLE_NAME FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN
            ('pp_rules', 'pp_beatmap_source', 'pp_score_attempt', 'pp_score_result', 'pp_difficulty', 'pp_best_score', 'pp_rank_history')`);
        if (rows.length !== 7) throw new Error('PP schema verification failed');
        console.log('PP migration verified: 6 tables and the per-client best-score view.');
    } finally { await sequelize.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
