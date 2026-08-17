const test = require('node:test');
const assert = require('node:assert/strict');
const {
    areTagsAllowedForPackType,
    getAllowedTagCategories,
    normalizeTagPayload,
} = require('../utils/packTag');
const { normalizeTagIds } = require('../services/packTagService');

test('normalizes a complete tag payload', () => {
    const result = normalizeTagPayload({
        tag_key: '  Speed-Jack  ',
        category: 'pattern',
        name_zh: '  速叠 ',
        name_en: ' Speed Jack ',
        sort_order: '30',
        enabled: true,
    });

    assert.deepEqual(result, {
        data: {
            tag_key: 'speed-jack',
            category: 'pattern',
            name_zh: '速叠',
            name_en: 'Speed Jack',
            tag_name: 'Speed Jack',
            sort_order: 30,
            enabled: true,
        },
    });
});

test('rejects invalid taxonomy fields', () => {
    assert.equal(normalizeTagPayload({}).error, 'invalidKey');
    assert.equal(normalizeTagPayload({ tag_key: 'Bad Key' }, { partial: true }).error, 'invalidKey');
    assert.equal(normalizeTagPayload({ category: 'other' }, { partial: true }).error, 'invalidCategory');
    assert.equal(normalizeTagPayload({ sort_order: -1 }, { partial: true }).error, 'invalidSortOrder');
});

test('maps pack types to allowed tag categories', () => {
    assert.deepEqual(getAllowedTagCategories(0), ['pattern', 'bpm', 'difficulty']);
    assert.deepEqual(getAllowedTagCategories(1), []);
    assert.deepEqual(getAllowedTagCategories(2), ['difficulty']);
    assert.deepEqual(getAllowedTagCategories(3), ['pattern']);
});

test('requires enabled tags from categories supported by the pack type', () => {
    assert.equal(areTagsAllowedForPackType([{ category: 'difficulty', enabled: true }], 2), true);
    assert.equal(areTagsAllowedForPackType([{ category: 'pattern', enabled: true }], 2), false);
    assert.equal(areTagsAllowedForPackType([{ category: 'difficulty', enabled: false }], 2), false);
});

test('normalizes tag IDs without changing existing IDs', () => {
    assert.deepEqual(normalizeTagIds(['7', 2, 7]), [7, 2]);
    assert.equal(normalizeTagIds([0, 2]), null);
    assert.equal(normalizeTagIds('1,2'), null);
});
