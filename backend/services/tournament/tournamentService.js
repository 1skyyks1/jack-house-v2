const sequelize = require('../../config/db');
const fs = require('fs');
const { Tournament, TStaff, TRound, TMappoolStats } = require('../../models/tournament');
const User = require('../../models/user/user');
const storage = require('../storage');
const auditService = require('./auditService');
const { buildContentHashObjectName, hashFile, optimizeImageFile } = require('../../utils/imageOptimizer');

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
const TEAM_AVATAR_STORAGE_SCOPE = process.env.TOURNAMENT_TEAM_AVATAR_STORAGE_SCOPE || (process.env.TOURNAMENT_TEAM_AVATAR_STORAGE_PROVIDER ? 'TOURNAMENT_TEAM_AVATAR' : 'RICHTEXT');
const TEAM_AVATAR_STORAGE_BUCKET = process.env.TOURNAMENT_TEAM_AVATAR_STORAGE_BUCKET || 'tournament-team-avatars';
const TOURNAMENT_AUDIT_IDENTITY_FIELDS = ['id', 'name', 'acronym', 'status'];

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
                tournament: auditService.pickModelValues(tournament, TOURNAMENT_AUDIT_IDENTITY_FIELDS),
                creator_host_id: staff.id
            },
            operator_id: operatorId
        }, { transaction });

        return tournament;
    });
};

const updateTournament = async (tid, body, operatorId) => {
    const patch = pickFields(body, UPDATE_FIELDS);
    if (body.qual_rank_mode !== undefined) {
        patch.qual_rank_mode = normalizeQualRankMode(body.qual_rank_mode);
    }

    return sequelize.transaction(async (transaction) => {
        const tournament = await Tournament.findByPk(tid, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!tournament) {
            throw makeError('赛事不存在', 404);
        }

        const oldValue = auditService.pickModelValues(tournament);
        await tournament.update(patch, { transaction });

        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'tournament',
            entity_id: tournament.id,
            action: 'update',
            old_value: oldValue,
            new_value: auditService.pickModelValues(tournament),
            operator_id: operatorId
        }, { transaction });

        return tournament;
    });
};

const uploadDefaultTeamAvatar = async (tid, file, operatorId) => {
    const tournament = await Tournament.findByPk(tid);
    if (!tournament) {
        throw makeError('赛事不存在', 404);
    }
    if (!file?.path) {
        throw makeError('没有图片上传');
    }

    const removeTempFile = () => {
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    };

    try {
        const optimized = await optimizeImageFile(file, { convertToWebp: true });
        const checksum = await hashFile(file.path);
        const fileName = buildContentHashObjectName(checksum, optimized.mimeType, file.filename);
        const objectName = `tournaments/${tid}/default-team-avatar/${fileName}`;
        const uploaded = await storage.uploadFile(TEAM_AVATAR_STORAGE_SCOPE, {
            bucket: TEAM_AVATAR_STORAGE_BUCKET,
            objectName,
            filePath: file.path,
            mimeType: optimized.mimeType,
            size: optimized.size,
        });
        const avatarUrl = uploaded.publicUrl || uploaded.downloadUrl || uploaded.url;
        return sequelize.transaction(async (transaction) => {
            const lockedTournament = await Tournament.findByPk(tid, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!lockedTournament) {
                throw makeError('赛事不存在', 404);
            }

            const oldValue = auditService.pickModelValues(lockedTournament);
            await lockedTournament.update({ default_team_avatar: avatarUrl || null }, { transaction });

            await auditService.writeAuditLog({
                t_id: tid,
                entity_type: 'tournament',
                entity_id: lockedTournament.id,
                action: 'upload_default_team_avatar',
                old_value: oldValue,
                new_value: {
                    ...auditService.pickModelValues(lockedTournament),
                    storage_provider: uploaded.provider,
                    object_key: uploaded.objectKey,
                    mime_type: uploaded.mimeType,
                    size: optimized.size,
                    checksum,
                },
                operator_id: operatorId
            }, { transaction });

            return lockedTournament;
        });
    } finally {
        removeTempFile();
    }
};

const deleteTournament = async (tid, operatorId) => {
    return sequelize.transaction(async (transaction) => {
        const tournament = await Tournament.findByPk(tid, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!tournament) {
            throw makeError('赛事不存在', 404);
        }

        const oldValue = auditService.pickModelValues(tournament, TOURNAMENT_AUDIT_IDENTITY_FIELDS);
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'tournament',
            entity_id: tournament.id,
            action: 'delete',
            old_value: oldValue,
            new_value: null,
            operator_id: operatorId
        }, { transaction });
        await TMappoolStats.destroy({ where: { t_id: tid }, transaction });
        await tournament.destroy({ transaction });
    });
};

module.exports = {
    createTournament,
    deleteTournament,
    getTournament,
    listTournaments,
    updateTournament,
    uploadDefaultTeamAvatar
};
