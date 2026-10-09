const assert = require('node:assert/strict');
const { test } = require('node:test');
const { gradeOf, countGrades } = require('../services/pp/gradeStats');

test('grades normalize legacy aliases and silver mods consistently', () => {
    for (const [rank, mods, expected] of [
        ['XH', [], 'SSH'], ['X', [], 'SS'], ['X', [{ acronym: 'HD' }], 'SSH'],
        ['SS', '[{"acronym":"FI"}]', 'SSH'], ['S', [{ acronym: 'FL' }], 'SH'],
        ['SSH', [], 'SSH'], ['SH', [], 'SH'], ['s', [], 'S'], ['A', [{ acronym: 'HD' }], 'A'],
        ['SS', null, 'SS'], ['B', 'bad-json', 'B'], [null, [], null], ['F', [], null],
    ]) assert.equal(gradeOf({ score_rank: rank, mods }), expected);
});

test('grade totals keep clients separate and include all best maps rather than only 50', () => {
    const rows = Array.from({ length: 60 }, () => ({ client: 'stable', score_rank: 'A', mods: [] }));
    rows.push({ client: 'lazer', score_rank: 'XH', mods: [] },
        { client: 'stable', score_rank: null }, { client: 'unknown', score_rank: 'SS' });
    const counts = countGrades(rows);
    assert.equal(counts.stable.A, 60);
    assert.equal(counts.lazer.SSH, 1);
    assert.equal(counts.stable.SSH, 0);
    assert.equal(counts.lazer.A, 0);
    assert.deepEqual(countGrades([]).stable, { SSH: 0, SS: 0, SH: 0, S: 0, A: 0, B: 0, C: 0, D: 0 });
});
