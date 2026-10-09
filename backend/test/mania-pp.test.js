const assert = require('node:assert/strict');
const { after, afterEach, test } = require('node:test');
const { calculatePP, DifficultyCache } = require('../services/pp/calculator');
const { aggregateBps, clientOf, validateScore, validateRankEligibility } = require('../services/pp/score');
const { snapshotScore } = require('../services/pp/repository');
const { processBatch, computeInThread, closeComputeWorker } = require('../services/pp/worker');
const sequelize = require('../config/db');
const { PackScore } = require('../models');

function mapText({ holds = 0, count = 1000, keys = 4 } = {}) {
    return `osu file format v14\n[General]\nMode:3\n[Metadata]\nTitle:PP test\n[Difficulty]\nCircleSize:${keys}\nOverallDifficulty:8\nHPDrainRate:8\nSliderMultiplier:1.4\nSliderTickRate:1\n[TimingPoints]\n0,500,4,2,1,50,1,0\n[HitObjects]\n`
        + Array.from({ length: count }, (_, i) => {
            const x = 64 + (i % 4) * 128;
            const time = 1000 + i * 100;
            return i < holds ? `${x},192,${time},128,0,${time + 75}:0:0:0:0:` : `${x},192,${time},1,0,0:0:0:0:`;
        }).join('\n');
}
const attempt = (overrides = {}) => ({ client: 'stable', passed: true, mods: [], statistics: { perfect: 1000 }, ...overrides });
const originalQuery = sequelize.query;
const originalTransaction = sequelize.transaction;
const originalFindOrCreate = PackScore.findOrCreate;
afterEach(() => {
    sequelize.query = originalQuery; sequelize.transaction = originalTransaction; PackScore.findOrCreate = originalFindOrCreate;
});
after(() => closeComputeWorker());

test('client origin is separate from CL, and unknown sources remain unknown', () => {
    assert.equal(clientOf({ build_id: 20261007, mods: [{ acronym: 'CL' }] }), 'lazer');
    assert.equal(clientOf({ build_id: null, mods: [{ acronym: 'CL' }] }), 'stable');
    assert.equal(clientOf({ legacy_score_id: 123, mods: [] }), 'stable');
    assert.equal(clientOf({ mods: [] }), 'unknown');
});

test('sparse statistics preserve six counts and ignore auxiliary judgements', () => {
    const valid = validateScore(attempt({ statistics: { perfect: 999, miss: 1, ignore_hit: 100, combo_break: 5 } }));
    assert.equal(valid.total, 1000);
    assert.deepEqual(valid.statistics, { perfect: 999, great: 0, good: 0, ok: 0, meh: 0, miss: 1 });
});

test('incomplete, failed, unsafe mod and invalid setting scores are excluded explicitly', () => {
    for (const invalid of [
        { passed: false }, { statistics: null }, { statistics: {} },
        { statistics: { perfect: -1 } }, { statistics: { perfect: 1.5 } },
        { statistics: { perfect: '1000' } }, { client: 'unknown' }, { mods: null },
        { mods: [{ acronym: 'AT' }] }, { mods: [{ acronym: '4K' }] }, { mods: [{ acronym: 'RD' }] },
        { mods: [{ acronym: 'DA', settings: { overall_difficulty: 5 } }] },
        { mods: [{ acronym: 'DT', settings: { speed_change: 0.1 } }] },
        { mods: [{ acronym: 'CL', settings: { custom_window: 50 } }] },
        { mods: [{ acronym: 'DT' }, { acronym: 'HT' }] },
        { mods: [{ acronym: 'HD' }, { acronym: 'HD' }] },
    ]) assert.throws(() => validateScore(attempt(invalid)), (error) => Boolean(error.reason));
});

test('PP uses MAX=320 rather than display accuracy and supports zero PP', () => {
    const content = mapText();
    const perfect = calculatePP(content, attempt());
    const great = calculatePP(content, attempt({ statistics: { great: 1000 } }));
    assert.ok(perfect.pp > great.pp);
    assert.equal(calculatePP(content, attempt({ statistics: { miss: 1000 } })).pp, 0);
});

test('unranked mods and non-default rates cannot enter BPs even when the calculator supports them', () => {
    const check = (score) => validateRankEligibility(validateScore(score), score.client);
    for (const mods of [[{ acronym: 'SV2' }], [{ acronym: 'AT' }], [{ acronym: 'HR' }],
        [{ acronym: 'DT', settings: { speed_change: 1.2 } }], [{ acronym: 'EZ', settings: { retries: 10 } }]]) {
        assert.throws(() => check(attempt({ mods })), (e) => e.reason?.startsWith('unranked_'));
    }
    assert.throws(() => check(attempt({ client: 'lazer', mods: [{ acronym: 'CL' }] })), /unranked_mod/);
    assert.doesNotThrow(() => check(attempt({ mods: [{ acronym: 'CL' }] })));
    assert.doesNotThrow(() => check(attempt({ client: 'lazer', mods: [] })));
    assert.doesNotThrow(() => check(attempt({ client: 'lazer', mods: [{ acronym: 'DT', settings: { speed_change: 1.5, adjust_pitch: true } }] })));
});

test('ranked gameplay and audio mods preserve PP and validate their settings', () => {
    const content = mapText();
    const base = calculatePP(content, attempt()).pp;
    const samples = [
        { acronym: 'SD', settings: { restart: true } },
        { acronym: 'PF', settings: { restart: true, require_perfect_hits: true } },
        { acronym: 'AC', settings: { minimum_accuracy: 0.99, accuracy_judge_mode: 'Standard', restart: false } },
        { acronym: 'CO', settings: { coverage: 0.8, direction: 'Down' } },
        { acronym: 'MU', settings: { inverse_muting: true, enable_metronome: true, mute_combo_count: 100, affects_hit_sounds: true } },
        { acronym: 'MR' },
    ];
    for (const mod of samples) {
        const score = attempt({ client: 'lazer', mods: [mod] });
        validateRankEligibility(validateScore(score), 'lazer');
        assert.equal(calculatePP(content, score).pp, base);
    }
    assert.equal(calculatePP(content, attempt({ mods: [{ acronym: 'NC' }] })).pp,
        calculatePP(content, attempt({ mods: [{ acronym: 'DT' }] })).pp);
});

test('native mania maps are accepted without a key-count eligibility filter', () => {
    assert.ok(calculatePP(mapText({ keys: 7 }), attempt()).pp > 0);
});

test('stable and lazer preserve the appropriate LN count, including lazer CL', () => {
    const content = mapText({ holds: 250 });
    const stable = calculatePP(content, attempt());
    const lazer = calculatePP(content, attempt({ client: 'lazer', statistics: { perfect: 1250 } }));
    const classic = calculatePP(content, attempt({ client: 'lazer', mods: [{ acronym: 'CL' }] }));
    assert.ok(lazer.pp > stable.pp);
    assert.equal(classic.pp, stable.pp);
    assert.throws(() => calculatePP(content, attempt({ client: 'lazer' })), /judgement_count_mismatch/);
});

test('DT, HT and custom rates recalculate difficulty and apply NF/EZ penalties', () => {
    const content = mapText();
    const nm = calculatePP(content, attempt());
    const dt = calculatePP(content, attempt({ mods: [{ acronym: 'DT' }] }));
    const ht = calculatePP(content, attempt({ mods: [{ acronym: 'HT' }] }));
    const custom = calculatePP(content, attempt({ mods: [{ acronym: 'DT', settings: { speed_change: 1.2, adjust_pitch: true } }] }));
    assert.ok(dt.pp > custom.pp && custom.pp > nm.pp && nm.pp > ht.pp);
    assert.equal(custom.clock_rate, 1.2);
    assert.equal(calculatePP(content, attempt({ mods: [{ acronym: 'NF' }] })).pp, nm.pp * 0.75);
    assert.equal(calculatePP(content, attempt({ mods: [{ acronym: 'EZ' }] })).pp, nm.pp * 0.5);
});

test('worker-thread and reused difficulty attributes match direct library calculation', async () => {
    const content = mapText();
    const cache = new DifficultyCache(1);
    try {
        const direct = calculatePP(content, attempt());
        assert.deepEqual(calculatePP(content, attempt(), cache), direct);
        assert.deepEqual(calculatePP(content, attempt(), cache), direct);
        assert.deepEqual(await computeInThread(content, attempt()), direct);
        assert.deepEqual(await computeInThread(content, attempt()), direct);
        calculatePP(content, attempt({ mods: [{ acronym: 'DT' }] }), cache);
        assert.equal(cache.entries.size, 1);
    } finally { cache.clear(); }
});

test('each client deduplicates maps and weights only its own highest 50 BPs', () => {
    const bps = Array.from({ length: 60 }, (_, i) => ({ client: 'stable', beatmap_id: i + 1, pp: 1000 - i }));
    bps.push({ client: 'stable', beatmap_id: 1, pp: 900 }, { client: 'lazer', beatmap_id: 1, pp: 500 });
    const totals = aggregateBps(bps);
    const expected = Array.from({ length: 50 }, (_, i) => (1000 - i) * 0.95 ** i).reduce((a, b) => a + b, 0);
    assert.equal(totals.stable.total_pp, expected);
    assert.equal(totals.stable.bp_count, 60);
    assert.equal(totals.stable.counted_bp_count, 50);
    assert.equal(totals.lazer.total_pp, 500);
    assert.equal(totals.lazer.bp_count, 1);
    assert.equal(aggregateBps([]).stable.total_pp, 0);
});

test('attempts are idempotent across packs and fallback identities include play time', () => {
    const raw = { id: '12345678901234567', beatmap_id: 22, build_id: 123, statistics: { perfect: 1 }, mods: [], passed: true };
    assert.equal(snapshotScore({ ...raw, pack_id: 1 }, 7).attemptKey, snapshotScore({ ...raw, pack_id: 2 }, 7).attemptKey);
    assert.notEqual(snapshotScore(raw, 7).attemptKey, snapshotScore(raw, 8).attemptKey);
    assert.notEqual(snapshotScore({ ...raw, id: null, ended_at: '2026-01-01' }, 7).attemptKey,
        snapshotScore({ ...raw, id: null, ended_at: '2026-01-02' }, 7).attemptKey);
});

test('PP datetime snapshots are explicit UTC strings independent of the host timezone', () => {
    const raw = { id: 1, beatmap_id: 22, build_id: 123, mods: [], passed: true,
        statistics: { perfect: 1 }, ended_at: '2026-08-30T15:20:51+08:00' };
    assert.equal(snapshotScore(raw, 7).playedAt, '2026-08-30 07:20:51.000');
    assert.equal(snapshotScore({ ...raw, ended_at: new Date('2026-08-30T07:20:51Z') }, 7).playedAt,
        '2026-08-30 07:20:51.000');
});

test('sync captures both clients and lower raw-score PP candidates before raw-score selection', async () => {
    const snapshots = [];
    const rawScores = [];
    sequelize.transaction = async (fn) => fn({ id: 'test' });
    sequelize.query = async (sql, options) => {
        if (sql.includes('SELECT DISTINCT pm.beatmap_id')) return [{ beatmap_id: 22 }, { beatmap_id: 23 }];
        if (sql.includes('INSERT INTO pp_score_attempt')) snapshots.push(options.replacements);
        return [[], 0];
    };
    PackScore.findOrCreate = async (options) => { rawScores.push(options.defaults.score); return [options.defaults, true]; };
    const { syncScorePairs } = require('../controllers/pack/packScoreController');
    const scores = [
        { id: 1, beatmap_id: 22, mods: [{ acronym: 'CL' }], statistics: { great: 1000 }, score: 1000000, passed: true },
        { id: 2, beatmap_id: 22, mods: [{ acronym: 'CL' }], statistics: { perfect: 999, miss: 1 }, score: 990000, passed: true },
        { id: 3, beatmap_id: 22, build_id: 123, mods: [], statistics: { perfect: 1000 }, score: 900000, passed: true },
        { id: 4, beatmap_id: 23, build_id: 123, mods: [], statistics: { perfect: 1000 }, score: 900000, passed: true },
    ];
    const result = await syncScorePairs({ pairs: [{ packId: 1, beatmapId: 22 }, { packId: 2, beatmapId: 22 }],
        ppBeatmapIds: [22, 23], scores, userId: 7 });
    assert.equal(snapshots.length, 4);
    assert.deepEqual(snapshots.map((row) => row.client).sort(), ['lazer', 'lazer', 'stable', 'stable']);
    assert.deepEqual(rawScores, [1000000, 1000000]);
    assert.equal(result.pp.candidates, 4);
});

test('durable jobs publish valid plays, exclude unranked mods, and retry transient failures', async () => {
    const updates = [];
    const content = mapText();
    const jobs = [
        { ...attempt(), id: 1, beatmap_id: 22, tries: 1 },
        { ...attempt({ mods: [{ acronym: 'SV2' }] }), id: 2, beatmap_id: 22, tries: 1 },
        { ...attempt({ client: 'lazer', mods: [{ acronym: 'CL' }] }), id: 3, beatmap_id: 22, tries: 1 },
        { ...attempt({ mods: [{ acronym: 'DT', settings: { speed_change: 1.2 } }] }), id: 4, beatmap_id: 22, tries: 1 },
        { ...attempt(), id: 5, beatmap_id: 23, tries: 1 },
        { ...attempt(), id: 6, beatmap_id: 23, tries: 5 },
    ];
    let token;
    sequelize.transaction = async (fn) => fn({ id: 'test' });
    sequelize.query = async (sql, options) => {
        const params = options.replacements;
        if (sql.includes('lease_until = DATE_ADD')) token = params.token;
        if (sql.includes('SELECT a.*, r.tries')) return jobs;
        if (sql.includes('SELECT lease_token')) return [{ lease_token: token }];
        if (sql.includes('SELECT source_checksum FROM pp_score_attempt')) return [{ source_checksum: null }];
        if (sql.includes('SELECT * FROM pp_beatmap_source')) {
            if (params.beatmapId === 23) throw new Error('simulated temporary database failure');
            return [{ checksum: 'a'.repeat(32), content }];
        }
        if (sql.includes('UPDATE pp_score_result SET status') && params?.id) updates.push(params);
        return [[], 0];
    };
    const result = await processBatch();
    assert.deepEqual(result, { processed: 6, ready: 1, excluded: 3, failed: 1, retrying: 1 });
    assert.ok(updates.find((row) => row.id === 1).pp > 0);
    assert.equal(updates.find((row) => row.id === 2).reason, 'unranked_mod');
    assert.equal(updates.find((row) => row.id === 3).reason, 'unranked_mod');
    assert.equal(updates.find((row) => row.id === 4).reason, 'unranked_mod_settings');
    assert.equal(updates.find((row) => row.id === 5).status, 'pending');
    assert.equal(updates.find((row) => row.id === 6).status, 'failed');
});
