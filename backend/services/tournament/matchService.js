const { TMatch, TMappool, TRound, TTeam } = require('../../models/tournament');
const auditService = require('./auditService');
const bracketService = require('./bracketService');

const MAIN_STAGE_MAP_TYPES = Object.freeze(['FU', 'DS', 'MD', 'LT', 'AC', 'QS', 'MN', 'RM', 'MX', 'DF', 'TB']);
const MAIN_STAGE_MAP_TYPE_SET = new Set(MAIN_STAGE_MAP_TYPES);

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const ensureRoundInTournament = async (tid, roundId) => {
    const round = await TRound.findOne({ where: { id: roundId, t_id: tid } });
    if (!round) {
        throw makeError('轮次不存在', 404);
    }
    return round;
};

const ensureTeamInTournament = async (tid, teamId, label = '队伍') => {
    if (!teamId) return null;
    const team = await TTeam.findOne({ where: { id: teamId, t_id: tid } });
    if (!team) {
        throw makeError(`${label}不存在或不属于本赛事`, 404);
    }
    return team;
};

const normalizeNullableInt = (value) => {
    if (value === undefined || value === null || value === '' || value === 'none') return null;
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
        throw makeError('ID 无效');
    }
    return normalized;
};

const ensureMatchInTournament = async (tid, matchId) => {
    const match = await TMatch.findByPk(matchId, {
        include: [{ model: TRound, as: 'round' }]
    });
    if (!match || Number(match.round?.t_id) !== Number(tid)) {
        throw makeError('比赛不存在', 404);
    }
    return match;
};

const normalizeBracketType = (value) => {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > 3) {
        throw makeError('无效的 bracket type');
    }
    return normalized;
};

const normalizeFirstTo = (value) => {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 15) {
        throw makeError('FT 必须是 1 到 15 的整数');
    }
    return normalized;
};

const normalizeOrder = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 0) {
        throw makeError('轮次顺序无效');
    }
    return normalized;
};

const normalizeDate = (value, label) => {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw makeError(`${label}无效`);
    }
    return date;
};

const buildRoundPayload = (body, existingRound = null) => {
    const name = body.name !== undefined ? String(body.name || '').trim() : existingRound?.name;
    if (!name) {
        throw makeError('轮次名称不能为空');
    }

    const payload = { name };
    if (body.bracket_type !== undefined || !existingRound) {
        payload.bracket_type = normalizeBracketType(body.bracket_type);
    }
    if (body.first_to !== undefined || !existingRound) {
        payload.first_to = normalizeFirstTo(body.first_to);
    }
    if (body.order !== undefined) {
        payload.order = normalizeOrder(body.order);
    } else if (!existingRound) {
        payload.order = null;
    }
    if (body.start_time !== undefined) {
        payload.start_time = normalizeDate(body.start_time, '开始时间');
    } else if (!existingRound) {
        payload.start_time = null;
    }
    if (body.end_time !== undefined) {
        payload.end_time = normalizeDate(body.end_time, '结束时间');
    } else if (!existingRound) {
        payload.end_time = null;
    }
    return payload;
};

const createRound = async (tid, body, operatorId) => {
    const payload = buildRoundPayload(body);
    const round = await TRound.create({
        t_id: tid,
        ...payload
    });

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'round',
        entity_id: round.id,
        action: 'create',
        old_value: null,
        new_value: auditService.pickModelValues(round),
        operator_id: operatorId
    });

    return round;
};

const updateRound = async (tid, roundId, body, operatorId) => {
    const round = await ensureRoundInTournament(tid, roundId);
    const oldValue = auditService.pickModelValues(round);
    const payload = buildRoundPayload(body, round);
    await round.update(payload);

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'round',
        entity_id: round.id,
        action: 'update',
        old_value: oldValue,
        new_value: auditService.pickModelValues(round),
        operator_id: operatorId
    });

    return round;
};

const deleteRound = async (tid, roundId, operatorId) => {
    const round = await ensureRoundInTournament(tid, roundId);
    const [matchCount, mapCount] = await Promise.all([
        TMatch.count({ where: { round_id: round.id } }),
        TMappool.count({ where: { round_id: round.id } })
    ]);
    if (matchCount > 0 || mapCount > 0) {
        throw makeError('轮次已有比赛或图池，不能直接删除；请先重建或清理相关数据');
    }

    const oldValue = auditService.pickModelValues(round);
    await round.destroy();
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'round',
        entity_id: round.id,
        action: 'delete',
        old_value: oldValue,
        new_value: null,
        operator_id: operatorId
    });
};

const normalizeMapType = (type) => {
    const normalized = String(type || '').trim().toUpperCase();
    if (!MAIN_STAGE_MAP_TYPE_SET.has(normalized)) {
        throw makeError(`正赛图池类型无效，仅支持 ${MAIN_STAGE_MAP_TYPES.join('/')}`);
    }
    return normalized;
};

const normalizePositiveInt = (value, label, defaultValue = null) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
        throw makeError(`${label}无效`);
    }
    return normalized;
};

const parseBeatmapUrl = (value) => {
    const url = String(value || '').trim();
    if (!url) return {};

    const match = url.match(/beatmapsets\/(\d+)(?:#\w+\/(\d+))?/);
    if (!match) {
        throw makeError('osu! 谱面 URL 无效');
    }

    return {
        map_id: match[2] ? Number(match[2]) : null,
        set_id: Number(match[1])
    };
};

const addRoundMap = async (tid, roundId, body, operatorId) => {
    await ensureRoundInTournament(tid, roundId);

    const parsedUrl = parseBeatmapUrl(body.url || body.beatmap_url);
    const mapId = normalizePositiveInt(body.map_id ?? parsedUrl.map_id, 'Beatmap ID');
    const setId = normalizePositiveInt(body.set_id ?? parsedUrl.set_id, 'Beatmapset ID', null);

    const payload = {
        artist: String(body.artist || '').trim(),
        map_id: mapId,
        mapper: String(body.mapper || '').trim(),
        set_id: setId,
        title: String(body.title || '').trim(),
        type: normalizeMapType(body.type)
    };

    if (!payload.artist || !payload.title || !payload.mapper) {
        throw makeError('谱面 artist、title 和 mapper 不能为空');
    }

    const existing = await TMappool.findOne({
        where: {
            map_id: payload.map_id,
            round_id: roundId
        }
    });
    if (existing) {
        throw makeError('该轮次已存在此谱面');
    }

    const map = await TMappool.create({
        round_id: roundId,
        ...payload
    });

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'round_mappool',
        entity_id: map.id,
        action: 'create',
        old_value: null,
        new_value: auditService.pickModelValues(map),
        operator_id: operatorId
    });

    return map;
};

const deleteRoundMap = async (tid, mapId, operatorId) => {
    const map = await TMappool.findByPk(mapId, {
        include: [{ model: TRound, as: 'round' }]
    });
    if (!map || Number(map.round?.t_id) !== Number(tid)) {
        throw makeError('图不存在', 404);
    }

    const oldValue = auditService.pickModelValues(map);
    await map.destroy();
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'round_mappool',
        entity_id: map.id,
        action: 'delete',
        old_value: oldValue,
        new_value: null,
        operator_id: operatorId
    });
};

const createMatch = async (tid, body, operatorId) => {
    const roundId = normalizeNullableInt(body.round_id);
    if (!roundId) {
        throw makeError('缺少轮次');
    }
    await ensureRoundInTournament(tid, roundId);

    const team1Id = normalizeNullableInt(body.team1_id);
    const team2Id = normalizeNullableInt(body.team2_id);
    if (team1Id && team2Id && team1Id === team2Id) {
        throw makeError('比赛双方不能是同一支队伍');
    }
    await ensureTeamInTournament(tid, team1Id, '红队');
    await ensureTeamInTournament(tid, team2Id, '蓝队');

    const match = await TMatch.create({
        round_id: roundId,
        team1_id: team1Id,
        team2_id: team2Id,
        scheduled_time: body.scheduled_time || null,
        is_possible: body.is_possible ? Number(body.is_possible) : 0,
        status: 0
    });

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'match',
        entity_id: match.id,
        action: 'create',
        old_value: null,
        new_value: auditService.pickModelValues(match),
        operator_id: operatorId
    });

    return match;
};

const normalizeResultType = (value) => {
    const normalized = String(value || 'normal').trim();
    if (!['normal', 'wbd', 'ff'].includes(normalized)) {
        throw makeError('无效的比赛结果类型');
    }
    return normalized;
};

const ensureWinnerBelongsToMatch = (match, winnerId) => {
    if (!winnerId) return;
    if (Number(winnerId) !== Number(match.team1_id) && Number(winnerId) !== Number(match.team2_id)) {
        throw makeError('胜方不属于本场比赛');
    }
};

const updateMatch = async (tid, matchId, body, operatorId) => {
    const match = await ensureMatchInTournament(tid, matchId);
    const oldValue = auditService.pickModelValues(match, [
        'id', 'team1_id', 'team2_id', 'team1_score', 'team2_score',
        'winner_id', 'status', 'result_type', 'result_note', 'winner_overridden',
        'mp_id', 'scheduled_time', 'is_possible'
    ]);

    const fields = ['mp_id', 'team1_roll', 'team2_roll', 'team1_score', 'team2_score',
        'scheduled_time', 'status', 'team1_timeout_used', 'team2_timeout_used',
        'is_possible', 'result_note', 'winner_overridden'];
    fields.forEach(field => {
        if (body[field] !== undefined) match[field] = body[field];
    });

    if (body.winner_id !== undefined) {
        match.winner_id = normalizeNullableInt(body.winner_id);
    }
    if (body.result_type !== undefined) {
        match.result_type = normalizeResultType(body.result_type);
    }
    if (!match.result_type) {
        match.result_type = 'normal';
    }

    ensureWinnerBelongsToMatch(match, match.winner_id);

    if (match.result_type === 'wbd' || match.result_type === 'ff') {
        if (!match.winner_id) {
            throw makeError('WBD/FF 需要指定胜方');
        }
        if (Number(match.winner_id) === Number(match.team1_id)) {
            match.team1_score = match.round.first_to;
            match.team2_score = -1;
        } else {
            match.team1_score = -1;
            match.team2_score = match.round.first_to;
        }
        match.status = 2;
    }

    await match.save();
    const newValue = auditService.pickModelValues(match, [
        'id', 'team1_id', 'team2_id', 'team1_score', 'team2_score',
        'winner_id', 'status', 'result_type', 'result_note', 'winner_overridden',
        'mp_id', 'scheduled_time', 'is_possible'
    ]);

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'match',
        entity_id: match.id,
        action: match.result_type === 'normal' ? 'update_match' : 'set_special_result',
        old_value: oldValue,
        new_value: newValue,
        operator_id: operatorId
    });

    let propagation = null;
    if (match.status === 2 && match.winner_id) {
        propagation = await bracketService.propagateMatchResult(match.id, operatorId);
    }

    return { match, propagation };
};

module.exports = {
    MAIN_STAGE_MAP_TYPES,
    addRoundMap,
    createMatch,
    createRound,
    deleteRound,
    deleteRoundMap,
    updateRound,
    updateMatch
};
