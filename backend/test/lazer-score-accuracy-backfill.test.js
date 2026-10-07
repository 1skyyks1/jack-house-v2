const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getRecalculatedLazerDetails, recalculateLazerScores } = require('../scripts/backfill-lazer-score-accuracy');

function score(overrides = {}) {
    return { id: 1, build_id: 20260826, accuracy: '0.9312500000', score_rank: 'A',
        statistics: { perfect: 20, great: 78, miss: 2 }, mods: [],
        score: 987654, updated_time: '2026-09-30 12:00:00', ...overrides };
}

function database(rows, { failUpdate = false } = {}) {
    const calls = [];
    return {
        calls,
        async beginTransaction() { calls.push('begin'); },
        async commit() { calls.push('commit'); },
        async rollback() { calls.push('rollback'); },
        async query(sql, args = []) {
            calls.push({ sql, args });
            if (sql.includes('MAX(id)')) return [{ last_id: Math.max(0, ...rows.map(row => row.id)) }];
            if (sql.startsWith('SELECT')) {
                return rows.filter(row => Number(row.build_id) > 0 && row.id > args[0] && row.id <= args[1])
                    .slice(0, args[2]).map(row => ({ ...row }));
            }
            if (failUpdate) throw new Error('simulated write failure');
            const row = rows.find(row => row.id === args[2]);
            row.accuracy = args[0];
            row.score_rank = args[1];
            return { affectedRows: 1 };
        },
    };
}

test('historical JSON details use 305, fix the grade and ignore CL for lazer', () => {
    assert.deepEqual(getRecalculatedLazerDetails(score({ statistics: JSON.stringify({ perfect: 20, great: 78, miss: 2 }),
        mods: '[{"acronym":"CL"},{"acronym":"HD"}]' })),
    { accuracy: '0.9672131148', rank: 'SH', unchanged: false });
});

test('incomplete or invalid historical snapshots are skipped instead of fabricated', () => {
    for (const row of [score({ build_id: null }), score({ statistics: null }), score({ statistics: '{}' }),
        score({ statistics: '{broken' }), score({ statistics: { perfect: -1, great: 100 } }),
        score({ statistics: { perfect: 1.5 } }), score({ statistics: { perfect: null, great: 100 } }),
        score({ mods: null }), score({ mods: '{broken' }), score({ mods: [null] }), score({ score_rank: 'F' })]) {
        assert.ok(getRecalculatedLazerDetails(row).reason);
    }
});

test('preview scans both scopes in batches without transactions or writes', async () => {
    const rows = [score(), score({ id: 2, build_id: null }), score({ id: 3, statistics: null })];
    const before = structuredClone(rows);
    const connection = database(rows);
    const result = await recalculateLazerScores(connection, { batchSize: 1 });
    for (const report of Object.values(result.tables)) {
        assert.equal(report.scanned, 2);
        assert.equal(report.changed, 1);
        assert.equal(report.skipped, 1);
        assert.equal(report.updated, 0);
    }
    assert.deepEqual(rows, before);
    assert.ok(connection.calls.every(call => typeof call === 'object' && call.sql.startsWith('SELECT') && !call.sql.includes('FOR UPDATE')));
});

test('apply preserves stable rows, scores and tie-break timestamps and is idempotent', async () => {
    const rows = [score(), score({ id: 2, build_id: null })];
    const stable = structuredClone(rows[1]);
    const connection = database(rows);
    const report = (await recalculateLazerScores(connection, { apply: true, tables: ['pack_score'] })).tables.pack_score;
    assert.equal(report.updated, 1);
    assert.equal(rows[0].accuracy, '0.9672131148');
    assert.equal(rows[0].score_rank, 'S');
    assert.equal(rows[0].score, 987654);
    assert.equal(rows[0].updated_time, '2026-09-30 12:00:00');
    assert.deepEqual(rows[1], stable);
    const update = connection.calls.find(call => call.sql?.startsWith('UPDATE'));
    assert.equal(update.sql, 'UPDATE `pack_score` SET accuracy = ?, score_rank = ?, updated_time = updated_time WHERE id = ?');
    assert.ok(connection.calls.some(call => call.sql?.includes('FOR UPDATE')));
    assert.ok(connection.calls.includes('commit'));
    const repeated = (await recalculateLazerScores(connection, { apply: true, tables: ['pack_score'] })).tables.pack_score;
    assert.equal(repeated.changed, 0);
    assert.equal(repeated.updated, 0);
    assert.equal(repeated.unchanged, 1);
});

test('write failure rolls back its batch and invalid table names cannot reach SQL', async () => {
    const connection = database([score()], { failUpdate: true });
    await assert.rejects(recalculateLazerScores(connection, { apply: true }), /simulated write failure/);
    assert.ok(connection.calls.includes('rollback'));
    assert.ok(!connection.calls.includes('commit'));
    const invalid = database([]);
    await assert.rejects(recalculateLazerScores(invalid, { tables: ['unexpected'] }), /Only pack_score/);
    assert.equal(invalid.calls.length, 0);
});
