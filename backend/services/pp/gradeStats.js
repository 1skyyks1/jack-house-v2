const { parseJson } = require('./score');

const GRADES = ['SSH', 'SS', 'SH', 'S', 'A', 'B', 'C', 'D'];

function gradeOf(score) {
    const rank = typeof score.score_rank === 'string' ? score.score_rank.toUpperCase() : '';
    const mods = parseJson(score.mods);
    const silver = Array.isArray(mods) && mods.some(mod =>
        ['HD', 'FI', 'FL'].includes(String(mod?.acronym || mod || '').toUpperCase()));
    if (rank === 'XH') return 'SSH';
    if (rank === 'X' || rank === 'SS') return silver ? 'SSH' : 'SS';
    if (rank === 'S' && silver) return 'SH';
    return GRADES.includes(rank) ? rank : null;
}

function countGrades(rows) {
    const counts = Object.fromEntries(['stable', 'lazer'].map(client =>
        [client, Object.fromEntries(GRADES.map(grade => [grade, 0]))]));
    for (const row of rows) {
        const grade = gradeOf(row);
        if (grade && counts[row.client]) counts[row.client][grade] += 1;
    }
    return counts;
}

module.exports = { gradeOf, countGrades };
