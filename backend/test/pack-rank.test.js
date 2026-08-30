const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const sequelize = require('../config/db');
const { backfillPackScoresFromEvents, isPackRankEligibleMap } = require('../services/packRankService');

const originalQuery = sequelize.query;

afterEach(() => {
    sequelize.query = originalQuery;
});

test('enabling a Pack rank backfills each user and beatmap from real Event stages', async () => {
    let receivedSql;
    let receivedOptions;
    sequelize.query = async (sql, options) => {
        receivedSql = sql;
        receivedOptions = options;
        return [[], 0];
    };
    const transaction = { id: 'pack-rank-test' };

    await backfillPackScoresFromEvents(842, { transaction });

    assert.equal(receivedOptions.replacements.packId, 842);
    assert.equal(receivedOptions.transaction, transaction);
    assert.match(receivedSql, /PARTITION BY es\.user_id, es\.beatmap_id/);
    assert.match(receivedSql, /JOIN event_stage stage/);
    assert.match(receivedSql, /JOIN pack_map pm/);
    assert.match(receivedSql, /pm\.rating >= :minRankRating/);
    assert.equal(receivedOptions.replacements.minRankRating, 0.5);
    assert.match(receivedSql, /WHERE es\.event_id > 0/);
    assert.match(receivedSql, /VALUES\(score\) > pack_score\.score/);
    assert.match(receivedSql, /score = GREATEST\(pack_score\.score, VALUES\(score\)\)/);
});

test('Featured eligibility excludes beatmaps below half a star', () => {
    assert.equal(isPackRankEligibleMap({ beatmap_id: 1, rating: 0.49 }), false);
    assert.equal(isPackRankEligibleMap({ beatmap_id: 1, rating: 0.5 }), true);
    assert.equal(isPackRankEligibleMap({ beatmap_id: 1, rating: '0.50' }), true);
    assert.equal(isPackRankEligibleMap({ beatmap_id: null, rating: 1 }), false);
});
