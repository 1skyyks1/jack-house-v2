const { Op } = require('sequelize');
const { User, Pack, PackMap } = require('../models');
const { select } = require('./pp/repository');
const { clientOf } = require('./pp/score');
const { syncScorePairs } = require('./featuredScoreSyncService');
const { isPackRankEligibleMap } = require('./packRankService');
const { fetchOmaManiaScores, getPlayedAt, getOsuScoreId } = require('./beatmapScoreService');
const shared = require('./omaSharedStore');

const positiveId = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
function validate(body, time = Date.now()) {
    if (!body || Object.keys(body).some(k => !['osuId', 'client', 'events'].includes(k))
        || !positiveId(body.osuId) || !['stable', 'lazer'].includes(body.client)
        || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 16) throw shared.error('INVALID_REQUEST', 400);
    const ids = new Set();
    for (const e of body.events) {
        if (!e || Object.keys(e).some(k => !['eventId', 'beatmapId', 'setId', 'startedAt', 'endedAt', 'scoreId'].includes(k))
            || typeof e.eventId !== 'string' || !/^[a-zA-Z0-9_-]{16,96}$/.test(e.eventId) || ids.has(e.eventId)
            || !positiveId(e.beatmapId) || (e.setId != null && !positiveId(e.setId))
            || !Number.isSafeInteger(e.startedAt) || !Number.isSafeInteger(e.endedAt)
            || e.endedAt < time - 1800000 || e.endedAt > time + 60000
            || e.startedAt > e.endedAt || e.startedAt < e.endedAt - 7200000
            || (e.scoreId != null && (typeof e.scoreId !== 'string' || !/^[1-9]\d{0,19}$/.test(e.scoreId)))) throw shared.error('INVALID_REQUEST', 400);
        ids.add(e.eventId);
    }
    return body;
}
async function account(osuId) {
    if (!positiveId(osuId)) throw shared.error('INVALID_OSU_ID', 400);
    return User.findOne({ where: { osu_uid: osuId, status: 0 }, attributes: ['user_id', 'osu_uid', 'status'] });
}
function buildIndex(packs) {
    const sets = new Set(), maps = new Map();
    for (const pack of packs) {
        if (positiveId(Number(pack.osu_bid))) sets.add(Number(pack.osu_bid));
        for (const map of pack.maps || []) {
            const id = Number(map.beatmap_id);
            if (positiveId(id)) maps.set(id, maps.get(id) === true || pack.leaderboard_enabled === true || Number(pack.leaderboard_enabled) === 1);
        }
    }
    const data = { sets: [...sets].sort((a, b) => a - b), maps: [...maps].sort((a, b) => a[0] - b[0]) };
    return { schema: 1, version: shared.hash(JSON.stringify(data)), ...data };
}
function invalidate() { shared.write('index-revision', { revision: require('node:crypto').randomBytes(16).toString('hex') }); }
for (const model of [Pack, PackMap]) {
    for (const hook of ['afterCreate', 'afterUpdate', 'afterDestroy', 'afterBulkCreate', 'afterBulkUpdate', 'afterBulkDestroy']) {
        model.addHook(hook, 'oma-index', (...args) => {
            const options = args.at(-1);
            const fields = options?.fields || (hook === 'afterBulkUpdate' ? Object.keys(options?.attributes || {}) : null);
            const relevant = model === Pack ? ['osu_bid', 'leaderboard_enabled'] : ['beatmap_id', 'pack_id'];
            if (hook.endsWith('Update') && fields && !fields.some(field => relevant.includes(field))) return;
            const mark = () => { try { invalidate(); } catch (err) { console.error('OMA index invalidation failed:', err.message); } };
            if (options?.transaction) options.transaction.afterCommit(mark); else mark();
        });
    }
}
function cachedVersion() {
    const cached = shared.read('index-meta'), revision = shared.read('index-revision')?.revision;
    return revision && cached?.revision !== revision ? 'dirty-' + revision : cached?.version || null;
}
async function index() {
    const cached = shared.read('index');
    const revision = shared.read('index-revision')?.revision;
    if (cached?.data?.schema === 1 && cached.revision === revision && cached.builtAt > Date.now() - 60000) return cached.data;
    // A stale 200/304 during another worker's rebuild would make OMA remember
    // the dirty target as downloaded. Return a retryable status instead.
    const release = await shared.claim('index');
    try {
        const latest = shared.read('index');
        const currentRevision = shared.read('index-revision')?.revision;
        if (latest?.revision === currentRevision && latest?.builtAt > Date.now() - 60000) return latest.data;
        const packs = await Pack.findAll({ attributes: ['osu_bid', 'leaderboard_enabled'], include: [{ model: PackMap, as: 'maps', attributes: ['beatmap_id'] }] });
        const data = buildIndex(packs);
        shared.write('index', { builtAt: Date.now(), revision: currentRevision, data });
        shared.write('index-meta', { version: data.version, revision: currentRevision });
        return data;
    } finally { await release(); }
}
async function request(input) {
    const body = validate(input);
    await shared.budget('user:' + body.osuId, 30, 60000);
    const release = await shared.claim('user:' + body.osuId);
    try {
        const user = await account(body.osuId);
        if (!user) return { exists: false, results: [], indexVersion: cachedVersion() };
        const keys = body.events.map(e => JSON.stringify([body.osuId, body.client, e]));
        const previous = await shared.receipts(keys);
        const results = body.events.map((e, i) => previous[i] || { eventId: e.eventId, status: 'retry' });
        const pending = body.events.filter((e, i) => !previous[i]);
        if (!pending.length) return { exists: true, results, indexVersion: cachedVersion() };
        // Exact difficulty, current featured eligibility. No trust in OMA's index/set ID.
        const packs = await Pack.findAll({ where: { leaderboard_enabled: true }, attributes: ['pack_id'],
            include: [{ model: PackMap, as: 'maps', required: true,
                where: { beatmap_id: { [Op.in]: pending.map(e => e.beatmapId) } }, attributes: ['beatmap_id', 'rating'] }] });
        const featured = new Set(packs.flatMap(p => (p.maps || []).map(m => Number(m.beatmap_id))));
        const eligible = pending.filter(e => featured.has(e.beatmapId));
        let scores = [];
        if (eligible.length) {
            // At most two recent pages for the batch; never scan 24h or per map.
            const since = new Date(Math.max(Date.now() - 1800000, Math.min(...eligible.map(e => e.endedAt)) - 90000));
            scores = await fetchOmaManiaScores(user, since, () => shared.budget('upstream', 60, 60000));
        }
        const matched = new Map();
        for (const e of eligible) matched.set(e.eventId, scores.filter(s => {
            const played = getPlayedAt(s)?.getTime();
            return /^[1-9]\d{0,19}$/.test(getOsuScoreId(s) || '') && s.passed === true && Number(s.user_id ?? s.user?.id) === body.osuId
                && Number(s.ruleset_id ?? s.mode_int) === 3 && clientOf(s) === body.client
                && Number(s.beatmap_id ?? s.beatmap?.id) === e.beatmapId
                && Number.isFinite(played) && Math.abs(played - e.endedAt) <= 90000
                && (e.scoreId == null || getOsuScoreId(s) === e.scoreId || String(s.legacy_score_id) === e.scoreId);
        }));
        const trusted = [...new Map([...matched.values()].flat().map(s => [getOsuScoreId(s), s])).values()];
        let summary;
        if (trusted.length) summary = await syncScorePairs({ userId: Number(user.user_id), scores: trusted,
            ppBeatmapIds: [...featured], pairs: packs.flatMap(p => (p.maps || []).filter(isPackRankEligibleMap)
                .map(m => ({ packId: Number(p.pack_id), beatmapId: Number(m.beatmap_id) }))),
            guard: async tx => {
                const [current] = await select('SELECT status,osu_uid FROM `user` WHERE user_id=:userId', { userId: user.user_id }, tx);
                if (!current || Number(current.status) !== 0 || Number(current.osu_uid) !== body.osuId) throw shared.error('ACCOUNT_CHANGED', 409);
                // Hold the current pack/map rows until commit: stale eligibility cannot write raw ranks.
                const rows = await select(`SELECT p.pack_id, pm.beatmap_id, pm.rating FROM pack p JOIN pack_map pm ON pm.pack_id=p.pack_id
                    WHERE p.leaderboard_enabled=1 AND pm.beatmap_id IN (:ids) FOR UPDATE`, { ids: [...featured] }, tx);
                const currentPairs = new Map(rows.map(r => [`${r.pack_id}:${r.beatmap_id}`, Number(r.rating)]));
                if (packs.some(p => (p.maps || []).some(m => !currentPairs.has(`${p.pack_id}:${m.beatmap_id}`)
                    || currentPairs.get(`${p.pack_id}:${m.beatmap_id}`) !== Number(m.rating)))) throw shared.error('ELIGIBILITY_CHANGED', 409);
            } });
        for (let i = 0; i < body.events.length; i++) {
            const e = body.events[i];
            if (previous[i]) continue;
            results[i] = { eventId: e.eventId, status: !featured.has(e.beatmapId) ? 'skipped' : matched.get(e.eventId)?.length ? 'done' : 'retry' };
        }
        await shared.receipts(keys, results);
        return { exists: true, results, retryAfterSeconds: 15, indexVersion: cachedVersion(), ...(summary ? { summary } : {}) };
    } finally { await release(); }
}
module.exports = { validate, account, buildIndex, cachedVersion, index, request };
