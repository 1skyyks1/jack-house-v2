const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const { EventScore, PackScore } = require('../models');
const {
    calculateManiaAccuracyAndRank,
    getBestScoresByBeatmap,
    getScoreDetails,
    upsertBestScore,
    upsertBestPackScore,
} = require('../services/beatmapScoreService');

const originalFindOrCreate = EventScore.findOrCreate;
const originalPackFindOrCreate = PackScore.findOrCreate;

afterEach(() => {
    EventScore.findOrCreate = originalFindOrCreate;
    PackScore.findOrCreate = originalPackFindOrCreate;
});

test('best score selection keeps only the highest recent score for each requested beatmap', () => {
    const scores = [
        { beatmap_id: 22, id: 1, legacy_total_score: 900000 },
        { beatmap: { id: 22 }, id: 2, legacy_total_score: 950000 },
        { beatmap_id: 23, id: 3, total_score: 800000 },
        { beatmap_id: 99, id: 4, legacy_total_score: 999999 },
    ];

    const best = getBestScoresByBeatmap(scores, [22, 23]);

    assert.equal(best.size, 2);
    assert.equal(best.get(22).scoreValue, 950000);
    assert.equal(best.get(22).raw.id, 2);
    assert.equal(best.get(23).scoreValue, 800000);
});

test('lazer scores use total_score and retain their detailed score snapshot', () => {
    const raw = {
        accuracy: 0,
        build_id: 20260826,
        legacy_total_score: 0,
        max_combo: 1234,
        mods: [{ acronym: 'DT', settings: { speed_change: 1.2 } }],
        rank: 'D',
        statistics: { perfect: 500, great: 20, good: 3, ok: 2, meh: 1, miss: 0 },
        total_score: 987654,
    };

    const best = getBestScoresByBeatmap([{ ...raw, beatmap_id: 22 }], [22]);
    assert.equal(best.get(22).scoreValue, 987654);
    assert.deepEqual(getScoreDetails(raw), {
        accuracy: (500 * 320 + 20 * 300 + 3 * 200 + 2 * 100 + 1 * 50) / (526 * 320),
        build_id: 20260826,
        max_combo: 1234,
        mods: [{ acronym: 'DT', settings: { speed_change: 1.2 } }],
        score_rank: 'S',
        statistics: { perfect: 500, great: 20, good: 3, ok: 2, meh: 1, miss: 0 },
    });
});

test('classic mania accuracy and rank are calculated from judgements when osu returns zero and D', () => {
    const result = calculateManiaAccuracyAndRank(
        { perfect: 955, great: 595, good: 202, ok: 22, meh: 1, miss: 49 },
        [{ acronym: 'CL' }]
    );

    assert.ok(Math.abs(result.accuracy - 0.9277229532163743) < Number.EPSILON);
    assert.equal(result.rank, 'A');
});

test('classic and lazer mania grades use their respective boundary rules', () => {
    assert.equal(calculateManiaAccuracyAndRank({ great: 95, miss: 5 }, [{ acronym: 'CL' }]).rank, 'A');
    assert.equal(calculateManiaAccuracyAndRank({ perfect: 95, miss: 5 }).rank, 'S');
    assert.equal(calculateManiaAccuracyAndRank({ perfect: 1, great: 99 }).rank, 'X');
    assert.equal(calculateManiaAccuracyAndRank({ perfect: 99, great: 1 }, [{ acronym: 'CL' }]).rank, 'X');
});

test('post-event import writes the independent event_id 0 scope', async () => {
    let receivedOptions;
    EventScore.findOrCreate = async (options) => {
        receivedOptions = options;
        return [{ score: options.defaults.score }, true];
    };

    const result = await upsertBestScore({
        beatmapId: 22,
        eventId: 0,
        score: { raw: { id: 123 }, scoreValue: 970000 },
        stageId: null,
        userId: 7,
    });

    assert.equal(result.updated, true);
    assert.deepEqual(receivedOptions.where, {
        beatmap_id: 22,
        event_id: 0,
        user_id: 7,
    });
    assert.equal(receivedOptions.defaults.stage_id, null);
});

test('new records persist score details together with the score', async () => {
    let defaults;
    EventScore.findOrCreate = async (options) => {
        defaults = options.defaults;
        return [{ score: options.defaults.score }, true];
    };

    await upsertBestScore({
        beatmapId: 22,
        eventId: 0,
        score: {
            raw: {
                accuracy: 0,
                build_id: 123,
                id: 456,
                max_combo: 1000,
                mods: [{ acronym: 'HD' }],
                rank: 'D',
                statistics: { perfect: 99, great: 1 },
            },
            scoreValue: 990000,
        },
        stageId: null,
        userId: 7,
    });

    assert.equal(defaults.accuracy, (99 * 320 + 300) / (100 * 320));
    assert.equal(defaults.build_id, 123);
    assert.equal(defaults.max_combo, 1000);
    assert.equal(defaults.score_rank, 'XH');
    assert.deepEqual(defaults.mods, [{ acronym: 'HD' }]);
    assert.deepEqual(defaults.statistics, { perfect: 99, great: 1 });
});

test('same event scope updates only when the imported score is higher', async () => {
    const updates = [];
    const record = {
        score: 900000,
        stage_id: 3,
        update: async (values) => updates.push(values),
    };
    EventScore.findOrCreate = async () => [record, false];

    const lower = await upsertBestScore({
        beatmapId: 22,
        eventId: 5,
        score: { raw: { id: 124 }, scoreValue: 899999 },
        stageId: 3,
        userId: 7,
    });
    const higher = await upsertBestScore({
        beatmapId: 22,
        eventId: 5,
        score: { raw: { id: 125 }, scoreValue: 950000 },
        stageId: 3,
        userId: 7,
    });

    assert.equal(lower.updated, false);
    assert.equal(higher.updated, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].score, 950000);
    assert.equal(updates[0].stage_id, 3);
});

test('pack score scope is independent per pack and beatmap', async () => {
    let receivedOptions;
    PackScore.findOrCreate = async (options) => {
        receivedOptions = options;
        return [{ score: options.defaults.score }, true];
    };

    const result = await upsertBestPackScore({
        beatmapId: 22,
        packId: 842,
        score: { raw: { id: 126 }, scoreValue: 975000 },
        userId: 7,
    });

    assert.equal(result.created, true);
    assert.equal(result.updated, true);
    assert.deepEqual(receivedOptions.where, {
        beatmap_id: 22,
        pack_id: 842,
        user_id: 7,
    });
});

test('pack score keeps the existing record when the imported score is not higher', async () => {
    const updates = [];
    const record = {
        score: 900000,
        update: async (values) => updates.push(values),
    };
    PackScore.findOrCreate = async () => [record, false];

    const equal = await upsertBestPackScore({
        beatmapId: 22,
        packId: 842,
        score: { raw: { id: 127 }, scoreValue: 900000 },
        userId: 7,
    });
    const higher = await upsertBestPackScore({
        beatmapId: 22,
        packId: 842,
        score: { raw: { id: 128 }, scoreValue: 950000 },
        userId: 7,
    });

    assert.equal(equal.updated, false);
    assert.equal(higher.updated, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].score, 950000);
});
