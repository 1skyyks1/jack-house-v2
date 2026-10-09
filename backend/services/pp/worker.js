const { randomUUID } = require('node:crypto');
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { ALGORITHM_VERSION, IneligibleScore, hash, validateScore, validateRankEligibility } = require('./score');
const { select, write } = require('./repository');
const { getSource } = require('./source');

let computeWorker;
const tasks = new Map();
function closeComputeWorker() {
    const worker = computeWorker;
    computeWorker = null;
    if (worker) void worker.terminate();
    for (const task of tasks.values()) {
        clearTimeout(task.timer); task.reject(new Error('calculation_worker_failed'));
    }
    tasks.clear();
}
function getComputeWorker() {
    if (computeWorker) return computeWorker;
    const worker = new Worker(path.join(__dirname, 'computeThread.js'));
    computeWorker = worker;
    worker.on('message', (message) => {
        const task = tasks.get(message.id);
        if (!task) return;
        clearTimeout(task.timer); tasks.delete(message.id);
        if (message.error) task.reject(message.excluded ? new IneligibleScore(message.error) : new Error(message.error));
        else task.resolve(message.result);
        if (!tasks.size) worker.unref();
    });
    const fail = () => { if (computeWorker === worker) closeComputeWorker(); };
    worker.on('error', fail); worker.on('exit', fail);
    worker.unref();
    return worker;
}
function computeInThread(content, attempt) {
    // One bounded task per worker; CPU-heavy WASM never runs on the HTTP event loop.
    return new Promise((resolve, reject) => {
        const worker = getComputeWorker();
        const id = randomUUID();
        worker.ref();
        const timer = setTimeout(() => {
            closeComputeWorker();
        }, 30000);
        tasks.set(id, { resolve, reject, timer });
        worker.postMessage({ id, content, attempt });
    });
}

async function processBatch({ limit = 10 } = {}) {
    const token = randomUUID();
    const size = Math.min(Math.max(Number(limit) || 10, 1), 10);
    await write(`UPDATE pp_score_result SET status = 'pending', lease_token = NULL, lease_until = NULL
        WHERE algorithm_version = :version AND status = 'processing' AND lease_until < NOW()`,
    { version: ALGORITHM_VERSION });
    // Atomic lease acquisition supports several backend processes without double publication.
    await write(`UPDATE pp_score_result SET status = 'processing', lease_token = :token,
        lease_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE), tries = tries + 1
        WHERE algorithm_version = :version AND status = 'pending' AND retry_at <= NOW()
        ORDER BY attempt_id LIMIT :limit`, { token, version: ALGORITHM_VERSION, limit: size });
    const jobs = await select(`SELECT a.*, r.tries FROM pp_score_attempt a
        JOIN pp_score_result r ON r.attempt_id = a.id
        WHERE r.algorithm_version = :version AND r.lease_token = :token AND r.status = 'processing'
        ORDER BY a.id`, { token, version: ALGORITHM_VERSION });
    const summary = { processed: jobs.length, ready: 0, excluded: 0, failed: 0, retrying: 0 };
    for (const attempt of jobs) {
        const scope = { id: attempt.id, version: ALGORITHM_VERSION, token };
        try {
            const input = validateScore(attempt);
            validateRankEligibility(input, attempt.client);
            const source = await getSource(attempt);
            const result = await computeInThread(source.content, attempt);
            const cacheKey = hash([source.checksum, ALGORITHM_VERSION, attempt.client, input.mods, input.clockRate]);
            const sequelize = require('../../config/db');
            const published = await sequelize.transaction(async (transaction) => {
                const [lease] = await select(`SELECT lease_token FROM pp_score_result
                    WHERE attempt_id = :id AND algorithm_version = :version FOR UPDATE`, scope, transaction);
                if (lease?.lease_token !== token) return false;
                const [snapshot] = await select('SELECT source_checksum FROM pp_score_attempt WHERE id = :id FOR UPDATE', scope, transaction);
                if (snapshot.source_checksum && snapshot.source_checksum !== source.checksum) {
                    throw new Error('source_pinned_by_another_version');
                }
                await write(`INSERT IGNORE INTO pp_difficulty
                    (cache_key, source_checksum, algorithm_version, client, mods, clock_rate, stars, attributes)
                    VALUES (:key, :checksum, :version, :client, :mods, :rate, :stars, :attributes)`,
                { key: cacheKey, checksum: source.checksum, version: ALGORITHM_VERSION, client: attempt.client,
                    mods: JSON.stringify(result.mods), rate: result.clock_rate, stars: result.stars,
                    attributes: JSON.stringify(result.attributes) }, transaction);
                await write(`UPDATE pp_score_attempt SET source_checksum = :checksum,
                    source_verified = IF(reported_checksum = :checksum, 1, 0)
                    WHERE id = :id AND (source_checksum IS NULL OR source_checksum = :checksum)`,
                { id: attempt.id, checksum: source.checksum }, transaction);
                await write(`UPDATE pp_score_result SET status = 'ready', pp = :pp, stars = :stars,
                    clock_rate = :rate, source_checksum = :checksum, reason = NULL,
                    calculated_at = NOW(), lease_token = NULL, lease_until = NULL
                    WHERE attempt_id = :id AND algorithm_version = :version AND lease_token = :token`,
                { ...scope, pp: result.pp, stars: result.stars, rate: result.clock_rate, checksum: source.checksum }, transaction);
                return true;
            });
            if (published) summary.ready += 1;
        } catch (error) {
            const excluded = error instanceof IneligibleScore;
            const status = excluded ? 'excluded' : (Number(attempt.tries) >= 5 ? 'failed' : 'pending');
            const reason = excluded ? error.reason : 'processing_failed';
            await write(`UPDATE pp_score_result SET status = :status, reason = :reason,
                retry_at = DATE_ADD(NOW(), INTERVAL :delay SECOND), lease_token = NULL, lease_until = NULL
                WHERE attempt_id = :id AND algorithm_version = :version AND lease_token = :token`,
            { ...scope, status, reason, delay: Math.min(3600, 30 * 2 ** Number(attempt.tries)) });
            summary[excluded ? 'excluded' : (status === 'failed' ? 'failed' : 'retrying')] += 1;
        }
    }
    if (summary.ready > 0) require('./rankHistory').requestSnapshot();
    return summary;
}

function start() {
    if (process.env.PP_WORKER_ENABLED === 'false') return;
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try { await processBatch(); }
        catch { console.error('PP worker could not read its queue. Run migrate:pp before starting the backend.'); }
        finally { running = false; }
    };
    const timer = setInterval(tick, 5000);
    timer.unref();
    void tick();
    return () => clearInterval(timer);
}

module.exports = { processBatch, computeInThread, closeComputeWorker, start };
