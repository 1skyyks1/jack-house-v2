const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { snapshotScore } = require('../services/pp/repository');

test('recent scores use their exact attempt, preserving zero PP and independent statuses', async () => {
    const values = ['ready', 'pending', 'processing', 'excluded', 'failed', 'unavailable'].map((status, i) => ({
        id: i + 1, pack_id: 7, beatmap_id: 99, osu_score_id: String(100 + i), build_id: i === 0 ? 0 : 123,
        mods: i === 0 ? [{ acronym: 'CL' }] : [], statistics: { perfect: 100 }, score: 900000 - i,
        played_at: new Date('2026-10-08T00:00:00Z'), updated_time: new Date(), pack: { pack_id: 7 }, status,
    }));
    const snapshots = values.map((row) => snapshotScore({ ...row, id: row.osu_score_id, ended_at: row.played_at, passed: true }, 1));
    let queries = 0;
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../services/userRecentScoreService'), 'utf8'), {
        module, console,
        require: (name) => {
            if (name === 'sequelize') return { Op: { or: Symbol('or') } };
            if (name === '../models') return {
                Pack: {},
                PackScore: { findAndCountAll: async () => ({ count: 6, rows: values.map((row) => ({ ...row, toJSON: () => row })) }) },
                PackMap: { findAll: async () => [{ pack_id: 7, beatmap_id: 99, version: 'same map', rating: 5 }] },
            };
            if (name === './pp/repository') return {
                snapshotScore,
                select: async (sql, { uniqueKeys }) => {
                    queries += 1;
                    assert.deepEqual(Array.from(uniqueKeys), snapshots.map((snapshot) => snapshot.attemptKey));
                    // A higher-PP attempt on this same map must not be substituted for any row.
                    return snapshots.slice(0, 5).map((snapshot, i) => ({ attempt_key: snapshot.attemptKey,
                        status: values[i].status, pp: i === 0 ? 0 : 1234 }));
                },
            };
            throw new Error(`Unexpected require: ${name}`);
        },
    });
    const result = await module.exports.listUserRecentScores(1, { limit: 6 });
    assert.equal(queries, 1);
    assert.equal(result.data[0].pp, 0);
    assert.equal(result.data[0].is_lazer, false);
    assert.equal(result.data[1].is_lazer, true);
    assert.deepEqual(Array.from(result.data, (row) => row.pp_status), values.map((row) => row.status));
    assert.ok(result.data.slice(1).every((row) => row.pp === null));
    assert.equal(result.hasMore, false);
});

require('node:test').after(() => require('../config/db').close());
