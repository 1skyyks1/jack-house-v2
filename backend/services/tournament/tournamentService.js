const sequelize = require('../../config/db');
const { Tournament, TStaff, TRound } = require('../../models/tournament');
const User = require('../../models/user/user');
const auditService = require('./auditService');

const CREATE_FIELDS = [
    'name',
    'acronym',
    'desc_zh',
    'desc_en',
    'rule_zh',
    'rule_en',
    'banner',
    'team_size_min',
    'team_size_max',
    'qual_top_n',
    'qual_rank_mode',
    'reg_start',
    'reg_end',
    'qual_start',
    'qual_end'
];

const UPDATE_FIELDS = [
    ...CREATE_FIELDS,
    'status'
];

const QUAL_RANK_MODE_TOTAL_SCORE = 0;
const QUAL_RANK_MODE_RANK_SUM = 1;

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const pickFields = (body, fields) => {
    return fields.reduce((acc, field) => {
        if (body[field] !== undefined) {
            acc[field] = body[field];
        }
        return acc;
    }, {});
};

const normalizeQualRankMode = (value) => {
    if (value === undefined || value === null || value === '') {
        return QUAL_RANK_MODE_TOTAL_SCORE;
    }

    const rankMode = Number(value);
    if (rankMode === QUAL_RANK_MODE_TOTAL_SCORE || rankMode === QUAL_RANK_MODE_RANK_SUM) {
        return rankMode;
    }

    throw makeError('资格赛排名方式无效');
};

const listTournaments = async () => {
    return Tournament.findAll({
        order: [['created_time', 'DESC']]
    });
};

const getTournament = async (tid) => {
    const tournament = await Tournament.findByPk(tid, {
        include: [
            { model: TStaff, as: 'staff', include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar'] }] },
            { model: TRound, as: 'rounds', order: [['order', 'ASC']] }
        ]
    });
    if (!tournament) {
        throw makeError('赛事不存在', 404);
    }
    return tournament;
};

const createTournament = async (body, operatorId) => {
    const data = {
        ...pickFields(body, CREATE_FIELDS),
        team_size_min: body.team_size_min || 1,
        team_size_max: body.team_size_max || 2,
        qual_top_n: body.qual_top_n || 32,
        qual_rank_mode: normalizeQualRankMode(body.qual_rank_mode),
        created_by: operatorId,
        status: 0
    };

    return sequelize.transaction(async (transaction) => {
        const tournament = await Tournament.create(data, { transaction });
        const staff = await TStaff.create({
            t_id: tournament.id,
            user_id: operatorId,
            role: 'host'
        }, { transaction });

        await auditService.writeAuditLog({
            t_id: tournament.id,
            entity_type: 'tournament',
            entity_id: tournament.id,
            action: 'create',
            old_value: null,
            new_value: {
                tournament: auditService.pickModelValues(tournament),
                creator_host: auditService.pickModelValues(staff)
            },
            operator_id: operatorId
        }, { transaction });

        return tournament;
    });
};

const updateTournament = async (tid, body, operatorId) => {
    const tournament = await Tournament.findByPk(tid);
    if (!tournament) {
        throw makeError('赛事不存在', 404);
    }

    const patch = pickFields(body, UPDATE_FIELDS);
    if (body.qual_rank_mode !== undefined) {
        patch.qual_rank_mode = normalizeQualRankMode(body.qual_rank_mode);
    }

    const oldValue = auditService.pickModelValues(tournament);
    await tournament.update(patch);

    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'tournament',
        entity_id: tournament.id,
        action: 'update',
        old_value: oldValue,
        new_value: auditService.pickModelValues(tournament),
        operator_id: operatorId
    });

    return tournament;
};

const deleteTournament = async (tid, operatorId) => {
    const tournament = await Tournament.findByPk(tid);
    if (!tournament) {
        throw makeError('赛事不存在', 404);
    }

    const oldValue = auditService.pickModelValues(tournament);
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'tournament',
        entity_id: tournament.id,
        action: 'delete',
        old_value: oldValue,
        new_value: null,
        operator_id: operatorId
    });
    await tournament.destroy();
};

module.exports = {
    createTournament,
    deleteTournament,
    getTournament,
    listTournaments,
    updateTournament
};
