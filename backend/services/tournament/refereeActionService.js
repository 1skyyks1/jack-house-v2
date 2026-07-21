const { TMatch, TMatchAction, TMappool, TRound } = require('../../models/tournament');
const sequelize = require('../../config/db');
const auditService = require('./auditService');
const roundStageService = require('./roundStageService');

const ACTION_TYPE_BY_LEGACY = {
    0: 'protect',
    1: 'ban',
    2: 'pick'
};

const ACTION_TYPES = new Set(['protect', 'ban', 'pick']);
const TIEBREAKER_TYPE = 'TB';

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const parseValue = (action) => {
    if (!action?.value_json) return {};
    try {
        return JSON.parse(action.value_json);
    } catch (error) {
        return {};
    }
};

const stringifyValue = (value) => {
    if (!value) return null;
    try {
        return JSON.stringify(value);
    } catch (error) {
        return JSON.stringify({ message: 'Failed to serialize action value' });
    }
};

const normalizeActionType = (actionType) => {
    if (typeof actionType === 'number' || /^\d+$/.test(String(actionType))) {
        const normalized = ACTION_TYPE_BY_LEGACY[Number(actionType)];
        if (!normalized) throw makeError('操作类型无效');
        return normalized;
    }
    const normalized = String(actionType || '').trim();
    if (!ACTION_TYPES.has(normalized)) {
        throw makeError('操作类型无效');
    }
    return normalized;
};

const ensureMatch = async (matchId, tid = null, options = {}) => {
    const match = await TMatch.findByPk(matchId, {
        include: [{ model: TRound, as: 'round' }],
        transaction: options.transaction,
        lock: options.lock
    });
    if (!match) {
        throw makeError('比赛不存在', 404);
    }
    if (tid && Number(match.round?.t_id) !== Number(tid)) {
        throw makeError('比赛不存在', 404);
    }
    return match;
};

const resolveTeamId = (match, body) => {
    if (body.team_id) {
        const teamId = Number(body.team_id);
        if (teamId !== Number(match.team1_id) && teamId !== Number(match.team2_id)) {
            throw makeError('队伍不属于本场比赛');
        }
        return teamId;
    }

    const actionBy = Number(body.action_by);
    if (actionBy === 1) return match.team1_id;
    if (actionBy === 2) return match.team2_id;
    throw makeError('缺少执行队伍');
};

const ensureMap = async (match, mapId, options = {}) => {
    const { maps } = await roundStageService.listStageMappool(match.round.t_id, match.round.id, options);
    const map = maps.find(item => Number(item.id) === Number(mapId)) || null;
    if (!map) {
        throw makeError('图不存在或不属于本轮次图池');
    }
    return map;
};

const isTiebreakerMap = (map) => String(map?.type || '').trim().toUpperCase() === TIEBREAKER_TYPE;

const validateManualMapAction = (actionType, map) => {
    if (!isTiebreakerMap(map)) return;
    if (actionType === 'protect' || actionType === 'ban') {
        throw makeError('决胜谱面不能被保护或禁用');
    }
    throw makeError('决胜谱面由系统自动选择');
};

const buildActionState = (actions, ignoredActionId = null) => {
    const state = {
        protectedMapIds: new Set(),
        bannedMapIds: new Set(),
        pickedMapIds: new Set(),
        protectedByTeam: new Map(),
        bannedByTeam: new Map(),
        pickedByTeam: new Map()
    };

    const pushTeamMap = (map, teamId, mapId) => {
        if (!map.has(teamId)) map.set(teamId, new Set());
        map.get(teamId).add(mapId);
    };

    for (const action of actions) {
        if (ignoredActionId && Number(action.id) === Number(ignoredActionId)) continue;
        if (!ACTION_TYPES.has(action.action_type) || !action.map_id) continue;

        const mapId = Number(action.map_id);
        const teamId = Number(action.team_id);
        if (action.action_type === 'protect') {
            state.protectedMapIds.add(mapId);
            pushTeamMap(state.protectedByTeam, teamId, mapId);
        } else if (action.action_type === 'ban') {
            state.bannedMapIds.add(mapId);
            pushTeamMap(state.bannedByTeam, teamId, mapId);
        } else if (action.action_type === 'pick') {
            state.pickedMapIds.add(mapId);
            pushTeamMap(state.pickedByTeam, teamId, mapId);
        }
    }

    return state;
};

const validateActionConflict = (state, actionType, teamId, mapId) => {
    if (actionType === 'protect') {
        if (state.protectedMapIds.has(mapId)) throw makeError('该图已经被保护');
        if (state.bannedMapIds.has(mapId)) throw makeError('该图已经被禁用，不能保护');
        if (state.pickedMapIds.has(mapId)) throw makeError('该图已经被选择，不能保护');
    }

    if (actionType === 'ban') {
        if (state.protectedMapIds.has(mapId)) throw makeError('已保护的图不能禁用');
        if (state.bannedMapIds.has(mapId)) throw makeError('该图已经被禁用');
        if (state.pickedMapIds.has(mapId)) throw makeError('该图已经被选择，不能禁用');
    }

    if (actionType === 'pick') {
        if (state.bannedMapIds.has(mapId)) throw makeError('已禁用的图不能选择');
        if (state.pickedMapIds.has(mapId)) throw makeError('该图已经被选择');
    }

    if (!teamId) {
        throw makeError('缺少执行队伍');
    }
};

const listActions = async (matchId, tid = null) => {
    await ensureMatch(matchId, tid);
    return TMatchAction.findAll({
        where: { match_id: matchId },
        include: [
            { model: TMappool, as: 'map' }
        ],
        order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });
};

const createAction = async (matchId, body, operatorId, tid = null) => {
    return sequelize.transaction(async (transaction) => {
        const match = await ensureMatch(matchId, tid, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        const actionType = normalizeActionType(body.action_type);
        const teamId = resolveTeamId(match, body);
        const map = await ensureMap(match, Number(body.map_id), { transaction });
        validateManualMapAction(actionType, map);
        const actions = await TMatchAction.findAll({
            where: { match_id: matchId },
            order: [['sort_order', 'ASC'], ['id', 'ASC']],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        const state = buildActionState(actions);
        validateActionConflict(state, actionType, teamId, map.id);

        const sortOrder = actions.length > 0
            ? Math.max(...actions.map(action => action.sort_order || 0)) + 1
            : 1;

        const action = await TMatchAction.create({
            match_id: matchId,
            action_type: actionType,
            team_id: teamId,
            map_id: map.id,
            value_json: stringifyValue({
                legacy_action_type: body.action_type,
                legacy_action_by: body.action_by,
                note: body.note || null
            }),
            sort_order: sortOrder,
            created_by: operatorId || null
        }, { transaction });

        await auditService.writeAuditLog({
            t_id: match.round?.t_id,
            entity_type: 'match_action',
            entity_id: action.id,
            action: 'create',
            old_value: null,
            new_value: auditService.pickModelValues(action),
            operator_id: operatorId
        }, { transaction });

        if (actionType === 'pick') {
            await ensureTiebreakerPick(match, operatorId, {
                actions: [...actions, action],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
        }

        return action;
    });
};

const updateAction = async (matchId, actionId, body, operatorId, tid = null) => {
    return sequelize.transaction(async (transaction) => {
        const match = await ensureMatch(matchId, tid, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        const action = await TMatchAction.findOne({
            where: { id: actionId, match_id: matchId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!action) {
            throw makeError('操作不存在', 404);
        }
        if (parseValue(action).automatic === true) {
            throw makeError('自动决胜谱面操作不能手动修改');
        }

        const oldValue = auditService.pickModelValues(action);
        const actionType = body.action_type !== undefined ? normalizeActionType(body.action_type) : action.action_type;
        const teamId = (body.team_id !== undefined || body.action_by !== undefined)
            ? resolveTeamId(match, body)
            : action.team_id;
        const mapId = body.map_id !== undefined ? Number(body.map_id) : action.map_id;
        const map = await ensureMap(match, mapId, { transaction });
        validateManualMapAction(actionType, map);

        const actions = await TMatchAction.findAll({
            where: { match_id: matchId },
            order: [['sort_order', 'ASC'], ['id', 'ASC']],
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        const state = buildActionState(actions, action.id);
        validateActionConflict(state, actionType, teamId, map.id);

        action.action_type = actionType;
        action.team_id = teamId;
        action.map_id = map.id;
        action.value_json = stringifyValue({
            ...parseValue(action),
            note: body.note !== undefined ? body.note : parseValue(action).note || null
        });
        await action.save({ transaction });

        await auditService.writeAuditLog({
            t_id: match.round?.t_id,
            entity_type: 'match_action',
            entity_id: action.id,
            action: 'update',
            old_value: oldValue,
            new_value: auditService.pickModelValues(action),
            operator_id: operatorId
        }, { transaction });

        return action;
    });
};

const ensureTiebreakerPick = async (match, operatorId, options = {}) => {
    const round = options.round || match?.round;
    if (!match || !round) return null;

    const firstTo = roundStageService.getRoundFirstTo(round);
    if (firstTo <= 1) return null;
    const team1Score = Number(options.team1Score ?? match.team1_score ?? 0);
    const team2Score = Number(options.team2Score ?? match.team2_score ?? 0);
    const maps = options.maps || (await roundStageService.listStageMappool(round.t_id, round.id, options)).maps;
    const tiebreakerMap = maps.find(isTiebreakerMap);
    if (!tiebreakerMap) return null;

    const actions = options.actions || await TMatchAction.findAll({
        where: { match_id: match.id },
        order: [['sort_order', 'ASC'], ['id', 'ASC']],
        transaction: options.transaction,
        ...(options.lock ? { lock: options.lock } : {})
    });
    const existing = actions.find(action => action.action_type === 'pick' && Number(action.map_id) === Number(tiebreakerMap.id));
    if (existing) return existing;

    const mapById = new Map(maps.map(map => [Number(map.id), map]));
    const regulationPickCount = actions.filter(action => action.action_type === 'pick'
        && !isTiebreakerMap(mapById.get(Number(action.map_id)))).length;
    const scoreReachedTiebreaker = team1Score === firstTo - 1 && team2Score === firstTo - 1;
    const picksReachedTiebreaker = regulationPickCount >= (firstTo * 2 - 2);
    if (!scoreReachedTiebreaker && !picksReachedTiebreaker) return null;

    const sortOrder = actions.length > 0
        ? Math.max(...actions.map(action => Number(action.sort_order) || 0)) + 1
        : 1;
    const action = await TMatchAction.create({
        match_id: match.id,
        action_type: 'pick',
        team_id: null,
        map_id: tiebreakerMap.id,
        value_json: stringifyValue({ automatic: true, reason: 'tiebreaker' }),
        sort_order: sortOrder,
        created_by: operatorId || null
    }, { transaction: options.transaction });

    await auditService.writeAuditLog({
        t_id: round.t_id,
        entity_type: 'match_action',
        entity_id: action.id,
        action: 'auto_pick_tiebreaker',
        old_value: null,
        new_value: auditService.pickModelValues(action),
        operator_id: operatorId
    }, { transaction: options.transaction });

    return action;
};

const buildUsedMaps = (actions, match = null) => {
    const usedMaps = {
        team1_protect: [],
        team2_protect: [],
        team1_ban: [],
        team2_ban: [],
        picked: []
    };

    for (const action of actions) {
        const mapId = action.map_id;
        const value = parseValue(action);
        let teamSide = value.legacy_action_by !== undefined ? Number(value.legacy_action_by) : null;
        if (!teamSide && match) {
            if (Number(action.team_id) === Number(match.team1_id)) teamSide = 1;
            if (Number(action.team_id) === Number(match.team2_id)) teamSide = 2;
        }
        if (action.action_type === 'protect') {
            if (teamSide === 2) usedMaps.team2_protect.push(mapId);
            else usedMaps.team1_protect.push(mapId);
        } else if (action.action_type === 'ban') {
            if (teamSide === 2) usedMaps.team2_ban.push(mapId);
            else usedMaps.team1_ban.push(mapId);
        } else if (action.action_type === 'pick') {
            usedMaps.picked.push(mapId);
        }
    }

    return usedMaps;
};

module.exports = {
    buildUsedMaps,
    createAction,
    ensureTiebreakerPick,
    listActions,
    updateAction
};
