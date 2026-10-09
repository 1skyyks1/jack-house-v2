const rosu = require('rosu-pp-js');
const { IneligibleScore, JUDGEMENTS, validateScore } = require('./score');

function inspectSource(content) {
    const map = new rosu.Beatmap(content);
    try {
        if (map.mode !== rosu.GameMode.Mania) throw new IneligibleScore('not_mania');
        if (map.isSuspicious() || map.nObjects < 1) throw new IneligibleScore('suspicious_beatmap');
        return { object_count: map.nObjects, hold_count: map.nHolds };
    } finally { map.free(); }
}

function calculatePP(content, attempt, cache) {
    const input = validateScore(attempt);
    const map = new rosu.Beatmap(content);
    let difficultyCalculator, difficulty, performanceCalculator, performance, state;
    let cached = false;
    try {
        if (map.mode !== rosu.GameMode.Mania) throw new IneligibleScore('not_mania');
        if (map.isSuspicious()) throw new IneligibleScore('suspicious_beatmap');
        const classic = !input.lazer || input.mods.some((mod) => mod.acronym === 'CL');
        const expected = map.nObjects + (classic ? 0 : map.nHolds);
        if (input.total !== expected) throw new IneligibleScore('judgement_count_mismatch');
        const args = { mods: input.mods, lazer: input.lazer, clockRate: input.clockRate };
        const cacheKey = require('./score').hash([content, args]);
        difficulty = cache?.get(cacheKey);
        cached = Boolean(difficulty);
        if (!difficulty) {
            difficultyCalculator = new rosu.Difficulty(args);
            difficulty = difficultyCalculator.calculate(map);
            if (cache) { cache.set(cacheKey, difficulty); cached = true; }
        }
        const j = input.statistics;
        performanceCalculator = new rosu.Performance({
            ...args, nGeki: j.perfect, n300: j.great, nKatu: j.good,
            n100: j.ok, n50: j.meh, misses: j.miss,
        });
        performance = performanceCalculator.calculate(difficulty);
        state = performance.state;
        const actual = [state.nGeki, state.n300, state.nKatu, state.n100, state.n50, state.misses];
        if (JUDGEMENTS.some((key, i) => actual[i] !== j[key])) throw new IneligibleScore('calculator_changed_statistics');
        if (!Number.isFinite(performance.pp) || performance.pp < 0 || !Number.isFinite(difficulty.stars)) {
            throw new IneligibleScore('invalid_calculation');
        }
        return { pp: performance.pp, stars: difficulty.stars, clock_rate: input.clockRate,
            attributes: difficulty.toJSON(), mods: input.mods };
    } finally {
        performance?.free(); performanceCalculator?.free();
        if (!cached) difficulty?.free();
        difficultyCalculator?.free(); map.free();
    }
}

class DifficultyCache {
    constructor(limit = 64) { this.entries = new Map(); this.limit = limit; }
    get(key) {
        const value = this.entries.get(key);
        if (value) { this.entries.delete(key); this.entries.set(key, value); }
        return value;
    }
    set(key, value) {
        if (this.entries.has(key)) this.entries.get(key).free();
        this.entries.delete(key); this.entries.set(key, value);
        if (this.entries.size > this.limit) {
            const oldest = this.entries.keys().next().value;
            this.entries.get(oldest).free(); this.entries.delete(oldest);
        }
    }
    clear() { for (const value of this.entries.values()) value.free(); this.entries.clear(); }
}

module.exports = { calculatePP, inspectSource, DifficultyCache };
