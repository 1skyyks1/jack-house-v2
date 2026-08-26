const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const { EventScore } = require('../models');
const {
    getBestScoresByBeatmap,
    getScoreDetails,
    upsertBestScore,
} = require('../services/beatmapScoreService');

const originalFindOrCreate = EventScore.findOrCreate;

afterEach(() => {
    EventScore.findOrCreate = originalFindOrCreate;
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
        accuracy: 0.987654,
        build_id: 20260826,
        legacy_total_score: 0,
        max_combo: 1234,
        mods: [{ acronym: 'DT', settings: { speed_change: 1.2 } }],
        rank: 'S',
        statistics: { perfect: 500, great: 20, good: 3, ok: 2, meh: 1, miss: 0 },
        total_score: 987654,
    };

    const best = getBestScoresByBeatmap([{ ...raw, beatmap_id: 22 }], [22]);
    assert.equal(best.get(22).scoreValue, 987654);
    assert.deepEqual(getScoreDetails(raw), {
        accuracy: 0.987654,
        build_id: 20260826,
        max_combo: 1234,
        mods: [{ acronym: 'DT', settings: { speed_change: 1.2 } }],
        score_rank: 'S',
        statistics: { perfect: 500, great: 20, good: 3, ok: 2, meh: 1, miss: 0 },
    });
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
                accuracy: 0.99,
                build_id: 123,
                id: 456,
                max_combo: 1000,
                mods: [{ acronym: 'HD' }],
                rank: 'S',
                statistics: { perfect: 100, miss: 1 },
            },
            scoreValue: 990000,
        },
        stageId: null,
        userId: 7,
    });

    assert.equal(defaults.accuracy, 0.99);
    assert.equal(defaults.build_id, 123);
    assert.equal(defaults.max_combo, 1000);
    assert.equal(defaults.score_rank, 'S');
    assert.deepEqual(defaults.mods, [{ acronym: 'HD' }]);
    assert.deepEqual(defaults.statistics, { perfect: 100, miss: 1 });
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
