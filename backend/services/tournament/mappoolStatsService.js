const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const { Tournament, TRound, TMappool, TMappoolStats, TMatch, TMatchAction } = require('../../models/tournament');
const auditService = require('./auditService');
const roundStageService = require('./roundStageService');

const ACTION_TYPES = ['protect', 'ban', 'pick'];
const MAP_FIELDS = ['id', 'round_id', 'type', 'map_id', 'set_id', 'artist', 'title', 'mapper', 'created_time'];

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const ensureTournament = async (tid, options = {}) => {
    const tournament = await Tournament.findByPk(tid, options);
    if (!tournament) throw makeError('赛事不存在', 404);
    return tournament;
};

const isInactiveResetFinal = (match) => match.bracket_group === 'reset_final'
    && Number(match.is_possible) === 1
    && Number(match.status) !== 2;

const getEffectiveMatches = (matches) => matches.filter(match => !isInactiveResetFinal(match));

const parseSnapshotMaps = (record) => {
    try {
        const parsed = JSON.parse(record.stats_json || '{}');
        return Array.isArray(parsed.maps) ? parsed.maps : [];
    } catch (_error) {
        return [];
    }
};

const serializeSnapshot = (record) => ({
    key: record.stage,
    label: roundStageService.getStageLabel(record.stage),
    is_complete: true,
    is_calculated: true,
    match_count: Number(record.match_count) || 0,
    completed_match_count: Number(record.completed_match_count) || 0,
    valid_match_count: Number(record.valid_match_count) || 0,
    calculated_at: record.calculated_at,
    calculated_by: record.calculated_by,
    maps: parseSnapshotMaps(record)
});

const listPublished = async (tid) => {
    await ensureTournament(tid);
    const records = await TMappoolStats.findAll({ where: { t_id: tid } });
    const recordByStage = new Map(records.map(record => [record.stage, record]));
    return {
        stages: roundStageService.STAGE_ORDER
            .map(stage => recordByStage.get(stage))
            .filter(Boolean)
            .map(serializeSnapshot)
    };
};

const loadStageState = async (tid, options = {}) => {
    await ensureTournament(tid, { transaction: options.transaction });
    const rounds = await TRound.findAll({
        where: { t_id: tid },
        order: [['order', 'ASC'], ['id', 'ASC']],
        transaction: options.transaction
    });
    const matches = await TMatch.findAll({
        include: [{
            model: TRound,
            as: 'round',
            where: { t_id: tid },
            attributes: ['id', 'name', 'bracket_type', 'order']
        }],
        order: [[{ model: TRound, as: 'round' }, 'order', 'ASC'], ['slot_no', 'ASC'], ['id', 'ASC']],
        transaction: options.transaction,
        ...(options.lock ? { lock: options.lock } : {})
    });

    const roundsByStage = new Map();
    for (const round of rounds) {
        const stage = roundStageService.getRoundStage(round);
        if (!stage) continue;
        if (!roundsByStage.has(stage)) roundsByStage.set(stage, []);
        roundsByStage.get(stage).push(round);
    }

    const matchesByStage = new Map();
    for (const match of matches) {
        const stage = roundStageService.getRoundStage(match.round);
        if (!stage) continue;
        if (!matchesByStage.has(stage)) matchesByStage.set(stage, []);
        matchesByStage.get(stage).push(match);
    }

    return { matchesByStage, roundsByStage };
};

const listManage = async (tid) => {
    const [{ matchesByStage, roundsByStage }, records] = await Promise.all([
        loadStageState(tid),
        TMappoolStats.findAll({ where: { t_id: tid } })
    ]);
    const recordByStage = new Map(records.map(record => [record.stage, record]));
    const stages = [];

    for (const stage of roundStageService.STAGE_ORDER) {
        const stageRounds = roundsByStage.get(stage) || [];
        if (stageRounds.length === 0) continue;
        const { maps } = await roundStageService.listStageMappool(tid, stageRounds[0].id);
        const effectiveMatches = getEffectiveMatches(matchesByStage.get(stage) || []);
        const completedMatches = effectiveMatches.filter(match => Number(match.status) === 2);
        const record = recordByStage.get(stage);

        stages.push({
            key: stage,
            label: roundStageService.getStageLabel(stage),
            map_count: maps.length,
            match_count: effectiveMatches.length,
            completed_match_count: completedMatches.length,
            is_complete: effectiveMatches.length > 0 && completedMatches.length === effectiveMatches.length,
            can_calculate: maps.length > 0 && effectiveMatches.length > 0 && completedMatches.length === effectiveMatches.length,
            is_calculated: Boolean(record),
            calculated_at: record?.calculated_at ?? null,
            calculated_by: record?.calculated_by ?? null,
            valid_match_count: record ? Number(record.valid_match_count) || 0 : null
        });
    }

    return { stages };
};

const calculate = async (tid, stage, operatorId) => {
    const normalizedStage = String(stage || '').trim().toLowerCase();
    if (!roundStageService.STAGE_ORDER.includes(normalizedStage)) {
        throw makeError('统计阶段无效');
    }

    return sequelize.transaction(async (transaction) => {
        await ensureTournament(tid, { transaction, lock: transaction.LOCK.UPDATE });
        const { matchesByStage, roundsByStage } = await loadStageState(tid, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        const stageRounds = roundsByStage.get(normalizedStage) || [];
        if (stageRounds.length === 0) throw makeError('该阶段不存在');

        const { maps } = await roundStageService.listStageMappool(tid, stageRounds[0].id, { transaction });
        if (maps.length === 0) throw makeError('该阶段图池为空');

        const effectiveMatches = getEffectiveMatches(matchesByStage.get(normalizedStage) || []);
        if (effectiveMatches.length === 0) throw makeError('该阶段没有比赛');

        const completedMatches = effectiveMatches.filter(match => Number(match.status) === 2);
        if (completedMatches.length !== effectiveMatches.length) {
            throw makeError('该阶段仍有未完成比赛');
        }

        const validMatches = completedMatches.filter(match => String(match.result_type || 'normal').toLowerCase() === 'normal');
        const validMatchIds = validMatches.map(match => Number(match.id));
        const actions = validMatchIds.length > 0
            ? await TMatchAction.findAll({
                where: {
                    match_id: { [Op.in]: validMatchIds },
                    action_type: { [Op.in]: ACTION_TYPES }
                },
                include: [{ model: TMappool, as: 'map' }],
                transaction
            })
            : [];
        const denominator = validMatches.length;
        const statsByMapKey = new Map();

        for (const map of maps) {
            statsByMapKey.set(getMapKey(map), {
                map: auditService.pickModelValues(map, MAP_FIELDS),
                protect_count: 0,
                ban_count: 0,
                pick_count: 0
            });
        }

        for (const action of actions) {
            const stats = action.map ? statsByMapKey.get(getMapKey(action.map)) : null;
            if (!stats) continue;
            if (action.action_type === 'protect') stats.protect_count++;
            if (action.action_type === 'ban') stats.ban_count++;
            if (action.action_type === 'pick') stats.pick_count++;
        }

        const statsMaps = Array.from(statsByMapKey.values()).map(stats => ({
            ...stats,
            protect_rate: denominator > 0 ? stats.protect_count / denominator : null,
            ban_rate: denominator > 0 ? stats.ban_count / denominator : null,
            pick_rate: denominator > 0 ? stats.pick_count / denominator : null
        }));
        let record = await TMappoolStats.findOne({
            where: { t_id: tid, stage: normalizedStage },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        const oldValue = record ? serializeSnapshot(record) : null;
        const calculatedAt = new Date();
        const values = {
            match_count: effectiveMatches.length,
            completed_match_count: completedMatches.length,
            valid_match_count: denominator,
            stats_json: JSON.stringify({ maps: statsMaps }),
            calculated_by: operatorId || null,
            calculated_at: calculatedAt
        };

        if (record) {
            record.set(values);
            await record.save({ transaction });
        } else {
            record = await TMappoolStats.create({
                t_id: tid,
                stage: normalizedStage,
                ...values
            }, { transaction });
        }

        const snapshot = serializeSnapshot(record);
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'mappool_stats',
            entity_id: record.id,
            action: oldValue ? 'recalculate' : 'calculate',
            old_value: oldValue,
            new_value: snapshot,
            operator_id: operatorId
        }, { transaction });

        return { message: '图池统计计算完成', stage: snapshot };
    });
};

const getMapKey = (map) => `${String(map?.type || '').trim().toUpperCase()}-${Number(map?.map_id || 0)}`;

module.exports = {
    calculate,
    listManage,
    listPublished
};
