// Preview: npm run backfill:lazer-score-accuracy
// Apply:   npm run backfill:lazer-score-accuracy -- --apply
const { calculateManiaAccuracyAndRank } = require('../services/beatmapScoreService');

const TABLES = ['pack_score', 'event_score'];
const JUDGEMENTS = ['perfect', 'great', 'good', 'ok', 'meh', 'miss'];

function parseJson(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
}

function getRecalculatedLazerDetails(row) {
    if (!Number.isSafeInteger(Number(row.build_id)) || Number(row.build_id) <= 0) {
        return { reason: 'not_lazer' };
    }
    const statistics = parseJson(row.statistics);
    if (!statistics || typeof statistics !== 'object' || Array.isArray(statistics)) {
        return { reason: 'missing_or_invalid_statistics' };
    }
    for (const judgement of JUDGEMENTS) {
        if (statistics[judgement] !== undefined
            && (statistics[judgement] === null || !Number.isSafeInteger(Number(statistics[judgement]))
                || Number(statistics[judgement]) < 0)) {
            return { reason: 'invalid_judgement_count' };
        }
    }
    const mods = parseJson(row.mods);
    if (!Array.isArray(mods) || mods.some(mod => !mod
        || (typeof mod !== 'string' && (typeof mod !== 'object' || typeof mod.acronym !== 'string')))) {
        return { reason: 'missing_or_invalid_mods' };
    }
    if (row.score_rank === 'F') return { reason: 'failed_score' };
    const calculated = calculateManiaAccuracyAndRank(statistics, mods, { isLazer: true });
    if (!calculated) return { reason: 'empty_statistics' };
    // Match the precision of DECIMAL(12,10), so repeated runs are idempotent.
    const accuracy = calculated.accuracy.toFixed(10);
    const unchanged = row.accuracy != null && Number.isFinite(Number(row.accuracy))
        && Number(row.accuracy).toFixed(10) === accuracy && row.score_rank === calculated.rank;
    return { accuracy, rank: calculated.rank, unchanged };
}

async function recalculateLazerScores(connection, { apply = false, batchSize = 500, tables = TABLES } = {}) {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
        throw new Error('batchSize must be an integer between 1 and 5000');
    }
    if (!tables.length || tables.some(table => !TABLES.includes(table))) {
        throw new Error('Only pack_score and event_score are supported');
    }
    const summary = { mode: apply ? 'apply' : 'preview', tables: {} };
    for (const table of tables) {
        const report = { scanned: 0, changed: 0, unchanged: 0, updated: 0, skipped: 0, reasons: {}, skippedExamples: [], examples: [] };
        summary.tables[table] = report;
        const [{ last_id: lastId }] = await connection.query(`SELECT COALESCE(MAX(id), 0) AS last_id FROM \`${table}\``);
        let cursor = 0;
        while (cursor < Number(lastId)) {
            if (apply) await connection.beginTransaction();
            try {
                // Lock only in apply mode. A concurrent higher score cannot be overwritten.
                const rows = await connection.query(
                    `SELECT id, build_id, accuracy, score_rank, statistics, mods FROM \`${table}\`
                     WHERE build_id IS NOT NULL AND build_id > 0 AND id > ? AND id <= ?
                     ORDER BY id ASC LIMIT ?${apply ? ' FOR UPDATE' : ''}`,
                    [cursor, lastId, batchSize]
                );
                for (const row of rows) {
                    report.scanned++;
                    const details = getRecalculatedLazerDetails(row);
                    if (details.reason) {
                        report.skipped++;
                        report.reasons[details.reason] = (report.reasons[details.reason] || 0) + 1;
                        if (report.skippedExamples.length < 10) report.skippedExamples.push({ id: row.id, reason: details.reason });
                        continue;
                    }
                    if (details.unchanged) { report.unchanged++; continue; }
                    report.changed++;
                    if (report.examples.length < 10) {
                        report.examples.push({ id: row.id, before: { accuracy: row.accuracy, rank: row.score_rank },
                            after: { accuracy: details.accuracy, rank: details.rank } });
                    }
                    if (apply) {
                        // Preserve updated_time: it breaks ties on the pack leaderboard.
                        const result = await connection.query(
                            `UPDATE \`${table}\` SET accuracy = ?, score_rank = ?, updated_time = updated_time WHERE id = ?`,
                            [details.accuracy, details.rank, row.id]
                        );
                        report.updated += Number(result.affectedRows);
                    }
                }
                if (apply) await connection.commit();
                if (rows.length === 0) break;
                cursor = Number(rows.at(-1).id);
            } catch (error) {
                if (apply) await connection.rollback();
                throw error;
            }
        }
    }
    return summary;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        console.log('Preview by default. Options: --apply --table=pack_score|event_score --batch-size=500');
        return;
    }
    if (args.some(arg => arg !== '--apply' && !arg.startsWith('--table=') && !arg.startsWith('--batch-size='))) {
        throw new Error('Unknown option; use --help');
    }
    const table = args.find(arg => arg.startsWith('--table='))?.slice('--table='.length);
    const batchSize = Number(args.find(arg => arg.startsWith('--batch-size='))?.slice('--batch-size='.length) ?? 500);
    if (table !== undefined && !TABLES.includes(table)) throw new Error('Invalid --table');
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5000) throw new Error('Invalid --batch-size');
    for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
        if (!process.env[name]) throw new Error(`${name} is required`);
    }
    const mariadb = require('mariadb');
    const options = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
        connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 15000 };
    if (process.env.DB_LOCAL_ADDRESS) {
        options.stream = () => require('node:net').connect({ host: options.host, port: options.port,
            localAddress: process.env.DB_LOCAL_ADDRESS });
    }
    const connection = await mariadb.createConnection(options);
    try {
        const summary = await recalculateLazerScores(connection, {
            apply: args.includes('--apply'), batchSize, tables: table ? [table] : TABLES,
        });
        console.log(JSON.stringify(summary, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Lazer score accuracy backfill failed:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { getRecalculatedLazerDetails, recalculateLazerScores };
