const { Op } = require('sequelize');
const { TMappool, TRound } = require('../../models/tournament');

const STAGE_ORDER = ['ro32', 'ro16', 'qf', 'sf', 'f', 'gf'];
const MAP_TYPE_ORDER = ['FU', 'DS', 'MD', 'LT', 'AC', 'QS', 'MN', 'RM', 'MX', 'DF', 'TB'];
const MAP_TYPE_INDEX = new Map(MAP_TYPE_ORDER.map((type, index) => [type, index]));

const STAGE_LABELS = Object.freeze({
    ro32: 'RO32',
    ro16: 'RO16',
    qf: 'QF',
    sf: 'SF',
    f: 'Finals',
    gf: 'Grand Finals'
});

const normalizeName = (value) => String(value || '').trim().toLowerCase();

const parseLoserRoundNo = (round) => {
    const name = normalizeName(round?.name);
    const match = name.match(/losers?\s+round\s+(\d+)/);
    if (match) return Number(match[1]);

    const order = Number(round?.order);
    if (Number.isInteger(order) && order >= 6 && order <= 13) {
        return order - 5;
    }

    return null;
};

const getRoundStage = (round) => {
    const name = normalizeName(round?.name);
    const bracketType = Number(round?.bracket_type);
    const order = Number(round?.order);

    if (bracketType === 2 || bracketType === 3 || name.includes('grand final') || name.includes('reset')) {
        return 'gf';
    }

    if (bracketType === 1 || name.includes('loser')) {
        const loserRoundNo = parseLoserRoundNo(round);
        if (loserRoundNo === 1) return 'ro16';
        if (loserRoundNo === 2 || loserRoundNo === 3) return 'qf';
        if (loserRoundNo === 4 || loserRoundNo === 5) return 'sf';
        if (loserRoundNo === 6 || loserRoundNo === 7) return 'f';
        if (loserRoundNo === 8) return 'gf';

        if (name.includes('semi')) return 'f';
        if (name.includes('grand final')) return 'gf';
        if (name.includes('final')) return 'f';
        return null;
    }

    if (name.includes('ro32') || name.includes('round of 32')) return 'ro32';
    if (name.includes('ro16') || name.includes('round of 16')) return 'ro16';
    if (name.includes('quarter') || name.includes('qf')) return 'qf';
    if (name.includes('semi') || name.includes('sf')) return 'sf';
    if (name.includes('final') || name === 'f') return 'f';

    if (Number.isInteger(order)) {
        if (order === 1) return 'ro32';
        if (order === 2) return 'ro16';
        if (order === 3) return 'qf';
        if (order === 4) return 'sf';
        if (order === 5) return 'f';
    }

    return null;
};

const getStageSortIndex = (stage) => {
    const index = STAGE_ORDER.indexOf(stage);
    return index === -1 ? STAGE_ORDER.length : index;
};

const getStageLabel = (stage) => STAGE_LABELS[stage] || stage || 'Round';

const getStageFirstTo = (stage) => {
    if (stage === 'ro32' || stage === 'ro16') return 5;
    if (stage === 'qf' || stage === 'sf') return 6;
    if (stage === 'f' || stage === 'gf') return 7;
    return null;
};

const getRoundFirstTo = (round) => {
    const fixedFirstTo = getStageFirstTo(getRoundStage(round));
    return fixedFirstTo || Number(round?.first_to) || 0;
};

const listRoundsByStage = async (tid, stage, options = {}) => {
    if (!stage) return [];
    const rounds = await TRound.findAll({
        where: { t_id: tid },
        order: [['order', 'ASC'], ['id', 'ASC']],
        transaction: options.transaction
    });
    return rounds.filter(round => getRoundStage(round) === stage);
};

const listStageRoundsForRound = async (tid, roundId, options = {}) => {
    const round = await TRound.findOne({
        where: { id: roundId, t_id: tid },
        transaction: options.transaction
    });
    if (!round) return { round: null, rounds: [], stage: null };

    const stage = getRoundStage(round);
    const rounds = stage ? await listRoundsByStage(tid, stage, options) : [round];
    return { round, rounds, stage };
};

const getCanonicalRoundForStage = async (tid, roundId, options = {}) => {
    const { round, rounds, stage } = await listStageRoundsForRound(tid, roundId, options);
    if (!round) return { canonicalRound: null, round: null, rounds: [], stage: null };
    const canonicalRound = rounds[0] || round;
    return { canonicalRound, round, rounds, stage };
};

const listStageMappool = async (tid, roundId, options = {}) => {
    const { round, rounds, stage } = await listStageRoundsForRound(tid, roundId, options);
    if (!round) return { maps: [], round: null, rounds: [], stage: null };

    const roundIds = (rounds.length > 0 ? rounds : [round]).map(item => item.id);
    const maps = await TMappool.findAll({
        where: { round_id: { [Op.in]: roundIds } },
        include: [{ model: TRound, as: 'round' }],
        order: [['created_time', 'ASC'], ['id', 'ASC']],
        transaction: options.transaction
    });

    return {
        maps: dedupeMaps(maps),
        round,
        rounds,
        stage
    };
};

const dedupeMaps = (maps) => {
    const seen = new Set();
    const result = [];
    for (const map of maps) {
        const key = `${String(map.type || '').toUpperCase()}-${map.map_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(map);
    }
    return result.sort(compareMappoolMaps);
};

const compareMappoolMaps = (a, b) => {
    const aType = String(a.type || '').trim().toUpperCase();
    const bType = String(b.type || '').trim().toUpperCase();
    const aIndex = MAP_TYPE_INDEX.has(aType) ? MAP_TYPE_INDEX.get(aType) : MAP_TYPE_ORDER.length;
    const bIndex = MAP_TYPE_INDEX.has(bType) ? MAP_TYPE_INDEX.get(bType) : MAP_TYPE_ORDER.length;
    if (aIndex !== bIndex) return aIndex - bIndex;
    if (aType !== bType) return aType.localeCompare(bType);

    const aTime = a.created_time ? new Date(a.created_time).getTime() : NaN;
    const bTime = b.created_time ? new Date(b.created_time).getTime() : NaN;
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
    if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(aTime) ? -1 : 1;

    return Number(a.id) - Number(b.id);
};

module.exports = {
    STAGE_LABELS,
    STAGE_ORDER,
    getCanonicalRoundForStage,
    getRoundFirstTo,
    getRoundStage,
    getStageLabel,
    getStageFirstTo,
    getStageSortIndex,
    listStageMappool,
    listStageRoundsForRound
};
