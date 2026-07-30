const assert = require('node:assert/strict');
const test = require('node:test');
const osuMatchService = require('../services/tournament/osuMatchService');

test('miss count uses actual score statistics and treats an omitted miss key as zero', () => {
    assert.equal(osuMatchService.getScoreMissCount({ statistics: { miss: 3, perfect: 100 } }), 3);
    assert.equal(osuMatchService.getScoreMissCount({ statistics: { perfect: 100 } }), 0);
    assert.equal(osuMatchService.getScoreMissCount({ score: { statistics: { count_miss: 2 } } }), 2);
    assert.equal(osuMatchService.getScoreMissCount({}), null);
});
