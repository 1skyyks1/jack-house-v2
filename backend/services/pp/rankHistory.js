const { write } = require('./repository');
const { rankingsCte } = require('./query');

// Each UTC day stores its latest observed ranking, independently for each rule version/client.
// Historical ranks cannot be reconstructed from score dates: the pool and other players change.
async function recordRankHistory(transaction) {
    await write(`INSERT INTO pp_rank_history
        (user_id, client, algorithm_version, snapshot_date, rank_position, total_pp, recorded_at)
        ${rankingsCte}
        SELECT participants.user_id, participants.client, rules.algorithm_version, UTC_DATE(),
               ranked.rank_position, COALESCE(ranked.total_pp, 0), UTC_TIMESTAMP()
        FROM (SELECT DISTINCT user_id, client FROM pp_score_attempt WHERE client IN ('stable', 'lazer')) participants
        CROSS JOIN pp_rules rules
        LEFT JOIN ranked_users ranked ON ranked.user_id = participants.user_id AND ranked.client = participants.client
        WHERE rules.id = 1
        ORDER BY participants.user_id, participants.client
        ON DUPLICATE KEY UPDATE rank_position = VALUES(rank_position), total_pp = VALUES(total_pp),
                                recorded_at = VALUES(recorded_at)`, {}, transaction);
}

let started = false;
let running = false;
let pending = null;
let lastRun = 0;

async function run() {
    if (running) return;
    running = true;
    try { await recordRankHistory(); }
    catch (error) {
        console.error('PP rank history snapshot failed:', error.original?.code || error.name);
    } finally { lastRun = Date.now(); running = false; }
}

function requestSnapshot() {
    if (!started || pending) return;
    pending = setTimeout(() => { pending = null; void run(); }, Math.max(0, 60000 - (Date.now() - lastRun)));
    pending.unref();
}

function start() {
    if (started) return;
    started = true;
    const timer = setInterval(requestSnapshot, 15 * 60000);
    timer.unref();
    requestSnapshot();
    return () => {
        clearInterval(timer);
        if (pending) clearTimeout(pending);
        pending = null;
        started = false;
    };
}

module.exports = { recordRankHistory, requestSnapshot, start };
