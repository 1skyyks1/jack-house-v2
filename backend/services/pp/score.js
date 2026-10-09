const { createHash } = require('node:crypto');

const ALGORITHM_VERSION = 'mania-4k-rosu-4.0.1-v1';
const JUDGEMENTS = ['perfect', 'great', 'good', 'ok', 'meh', 'miss'];
const SUPPORTED_MODS = new Set(['CL', 'NF', 'EZ', 'HR', 'HD', 'FI', 'FL', 'MR', 'DT', 'NC', 'HT', 'DC', 'SD', 'PF', 'AC', 'CO', 'MU']);
const UNRANKED_MODS = new Set(['SV2', 'AT', 'CN', 'RX', 'AP', 'DA', 'NR', 'HO', 'IN', 'RD', 'WU', 'WD', 'AS']);

class IneligibleScore extends Error {
    constructor(reason) { super(reason); this.reason = reason; }
}

const parseJson = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
};
const canonical = (value) => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    }
    return value;
};
const hash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function clientOf(score) {
    if (Number.isSafeInteger(Number(score.build_id)) && Number(score.build_id) > 0) return 'lazer';
    const mods = parseJson(score.mods);
    if ((score.build_id == null || Number(score.build_id) === 0)
        && (score.legacy_score_id != null || score._legacy_import === true
            || (Array.isArray(mods) && mods.some((mod) => (mod?.acronym || mod) === 'CL')))) return 'stable';
    return 'unknown';
}

function validateScore(attempt) {
    if (!['stable', 'lazer'].includes(attempt.client)) throw new IneligibleScore('unknown_client');
    if (!attempt.passed) throw new IneligibleScore('not_passed');
    const raw = parseJson(attempt.statistics);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new IneligibleScore('missing_statistics');
    const statistics = Object.fromEntries(JUDGEMENTS.map((key) => {
        const count = raw[key] ?? 0;
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
            throw new IneligibleScore('invalid_statistics');
        }
        return [key, count];
    }));
    const total = Object.values(statistics).reduce((sum, n) => sum + n, 0);
    if (!Number.isSafeInteger(total) || total < 1) throw new IneligibleScore('empty_statistics');
    const rawMods = parseJson(attempt.mods);
    if (!Array.isArray(rawMods)) throw new IneligibleScore('missing_mods');
    const mods = rawMods.map((rawMod) => {
        const acronym = String(rawMod?.acronym || rawMod || '').toUpperCase();
        if (UNRANKED_MODS.has(acronym)) throw new IneligibleScore('unranked_mod');
        if (!SUPPORTED_MODS.has(acronym)) throw new IneligibleScore('unsupported_mod');
        const settings = rawMod?.settings ?? {};
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new IneligibleScore('unsupported_mod_settings');
        const speedMod = ['DT', 'NC', 'HT', 'DC'].includes(acronym);
        for (const [key, value] of Object.entries(settings)) {
            if (speedMod && key === 'speed_change' && typeof value === 'number' && value >= 0.5 && value <= 2) continue;
            // Audio pitch has no effect on note timing or difficulty.
            if (['DT', 'HT'].includes(acronym) && key === 'adjust_pitch' && typeof value === 'boolean') continue;
            if (acronym === 'EZ' && key === 'retries' && Number.isInteger(value) && value >= 0 && value <= 10) continue;
            if (acronym === 'FL' && key === 'size_multiplier' && typeof value === 'number' && value >= 0.5 && value <= 3) continue;
            if (acronym === 'FL' && key === 'combo_based_size' && typeof value === 'boolean') continue;
            if (['SD', 'PF', 'AC'].includes(acronym) && key === 'restart' && typeof value === 'boolean') continue;
            if (acronym === 'PF' && key === 'require_perfect_hits' && typeof value === 'boolean') continue;
            if (acronym === 'AC' && key === 'minimum_accuracy' && typeof value === 'number' && value >= 0.6 && value <= 0.999) continue;
            if (acronym === 'AC' && key === 'accuracy_judge_mode' && ['Standard', 'MaximumAchievable'].includes(value)) continue;
            if (acronym === 'CO' && key === 'coverage' && typeof value === 'number' && value >= 0.2 && value <= 0.8) continue;
            if (acronym === 'CO' && key === 'direction' && ['Up', 'Down'].includes(value)) continue;
            if (acronym === 'MU' && ['inverse_muting', 'enable_metronome', 'affects_hit_sounds'].includes(key) && typeof value === 'boolean') continue;
            if (acronym === 'MU' && key === 'mute_combo_count' && Number.isInteger(value) && value >= 0 && value <= 500
                && !(value === 0 && settings.inverse_muting === true)) continue;
            throw new IneligibleScore('unsupported_mod_settings');
        }
        return { acronym, ...(Object.keys(settings).length ? { settings: canonical(settings) } : {}) };
    }).sort((a, b) => a.acronym.localeCompare(b.acronym));
    if (new Set(mods.map((mod) => mod.acronym)).size !== mods.length) throw new IneligibleScore('duplicate_mod');
    const speeds = mods.filter((mod) => ['DT', 'NC', 'HT', 'DC'].includes(mod.acronym));
    if (speeds.length > 1 || (mods.some((m) => m.acronym === 'EZ') && mods.some((m) => m.acronym === 'HR'))) {
        throw new IneligibleScore('conflicting_mods');
    }
    const acronyms = new Set(mods.map((mod) => mod.acronym));
    const conflicts = [['NF', 'SD'], ['NF', 'PF'], ['NF', 'AC'], ['SD', 'PF'], ['PF', 'AC'], ['EZ', 'AC'],
        ['HD', 'FI'], ['HD', 'FL'], ['FI', 'FL'], ['CO', 'HD'], ['CO', 'FI'], ['CO', 'FL']];
    if (conflicts.some(([left, right]) => acronyms.has(left) && acronyms.has(right))) throw new IneligibleScore('conflicting_mods');
    const speed = speeds[0];
    const clockRate = speed?.settings?.speed_change ?? (speed ? (['DT', 'NC'].includes(speed.acronym) ? 1.5 : 0.75) : 1);
    return { statistics, mods, total, clockRate, lazer: attempt.client === 'lazer' };
}

function validateRankEligibility(input, client) {
    // Eligibility is deliberately independent of whether rosu can calculate a value.
    // Policy source: osu! wiki, Upgrading to lazer / Will all mods be ranked? (2026-10-08).
    for (const mod of input.mods) {
        const { acronym, settings = {} } = mod;
        if (acronym === 'HR' || (client === 'lazer' && acronym === 'CL')
            || (client === 'stable' && ['DC', 'AC', 'CO', 'MU'].includes(acronym))) {
            throw new IneligibleScore('unranked_mod');
        }
        if (['DT', 'NC', 'HT', 'DC'].includes(acronym)) {
            const defaultRate = ['DT', 'NC'].includes(acronym) ? 1.5 : 0.75;
            if ((settings.speed_change ?? defaultRate) !== defaultRate) throw new IneligibleScore('unranked_mod_settings');
        }
        if (acronym === 'EZ' && (settings.retries ?? 2) !== 2) throw new IneligibleScore('unranked_mod_settings');
        if (acronym === 'FL' && ((settings.size_multiplier ?? 1) !== 1 || (settings.combo_based_size ?? false) !== false)) {
            throw new IneligibleScore('unranked_mod_settings');
        }
    }
}

function aggregateBps(bps, { topCount = 50, decay = 0.95 } = {}) {
    const best = new Map();
    for (const bp of bps) {
        const key = `${bp.client}:${bp.beatmap_id}`;
        if (!best.has(key) || bp.pp > best.get(key).pp) best.set(key, bp);
    }
    return Object.fromEntries(['stable', 'lazer'].map((client) => {
        const plays = [...best.values()].filter((bp) => bp.client === client).sort((a, b) => b.pp - a.pp);
        const totalPp = plays.slice(0, topCount).reduce((sum, bp, i) => sum + bp.pp * decay ** i, 0);
        return [client, { total_pp: totalPp, bp_count: plays.length, counted_bp_count: Math.min(plays.length, topCount) }];
    }));
}

module.exports = { ALGORITHM_VERSION, JUDGEMENTS, IneligibleScore, aggregateBps, canonical, clientOf, hash, parseJson, validateScore, validateRankEligibility };
