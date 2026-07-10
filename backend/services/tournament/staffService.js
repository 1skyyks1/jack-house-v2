const { TStaff, TPlayer } = require('../../models/tournament');
const User = require('../../models/user/user');
const sequelize = require('../../config/db');
const auditService = require('./auditService');
const { PLAYER_COMPATIBLE_STAFF_ROLES, STAFF_ROLE_SET } = require('./staffRoles');

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const canManageHost = (operator, tournament) => {
    return operator?.role === 2 || Number(tournament?.created_by) === Number(operator?.user_id);
};

const normalizeString = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized || null;
};

const normalizeNullableNumber = (value, fieldName) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isInteger(number)) {
        throw makeError(`${fieldName} 必须是整数`);
    }
    return number;
};

const osuAvatarUrl = (osuUid) => {
    const normalized = normalizeNullableNumber(osuUid, 'osu_uid');
    return normalized ? `https://a.ppy.sh/${normalized}` : null;
};

const listStaff = async (tid) => {
    return TStaff.findAll({
        where: { t_id: tid },
        include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'] }]
    });
};

const addStaff = async (tid, body, operator, tournament) => {
    let userId = normalizeNullableNumber(body.user_id, 'user_id');
    const role = body.role;

    if (!STAFF_ROLE_SET.has(role)) {
        throw makeError('无效的角色');
    }
    if (role === 'host' && !canManageHost(operator, tournament)) {
        throw makeError('只有创建者 host 可以添加其他 host', 403);
    }

    return sequelize.transaction(async (transaction) => {
        let user = null;
        if (userId) {
            user = await User.findByPk(userId, {
                attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!user) throw makeError('用户不存在', 404);
        } else {
            const osuUid = normalizeNullableNumber(body.osu_uid, 'osu_uid');
            if (!osuUid) throw makeError('user_id 或 osu_uid 至少需要一个');
            user = await User.findOne({
                where: { osu_uid: osuUid },
                attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!user) {
                const userName = normalizeString(body.user_name);
                if (!userName) throw makeError('导入非站内 staff 时 user_name 不能为空');
                user = await User.create({
                    user_name: userName,
                    password: null,
                    email: null,
                    avatar: normalizeString(body.avatar) || osuAvatarUrl(osuUid),
                    role: 0,
                    status: 0,
                    osu_uid: osuUid,
                    qq: null,
                    discord: null
                }, { transaction });
            }
            userId = user.user_id;
        }

        const existingPlayer = await TPlayer.findOne({ where: { t_id: tid, user_id: userId }, transaction });
        if (existingPlayer && !PLAYER_COMPATIBLE_STAFF_ROLES.includes(role)) {
            throw makeError('该用户已参赛，请先由 host 手动处理队伍/选手记录后再添加 staff');
        }

        const existing = await TStaff.findOne({ where: { t_id: tid, user_id: userId, role }, transaction });
        if (existing) throw makeError('该用户已拥有此角色');

        const staff = await TStaff.create({ t_id: tid, user_id: userId, role }, { transaction });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'staff',
            entity_id: staff.id,
            action: 'create',
            old_value: null,
            new_value: auditService.pickModelValues(staff),
            operator_id: operator?.user_id
        }, { transaction });

        return TStaff.findByPk(staff.id, {
            include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar', 'osu_uid'] }],
            transaction
        });
    });
};

const removeStaff = async (tid, staffId, operator, tournament) => {
    return sequelize.transaction(async (transaction) => {
        const staff = await TStaff.findOne({
            where: { id: staffId, t_id: tid },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!staff) throw makeError('Staff 不存在', 404);
        if (staff.role === 'host' && !canManageHost(operator, tournament)) {
            throw makeError('只有创建者 host 可以移除 host', 403);
        }

        const oldValue = auditService.pickModelValues(staff);
        await staff.destroy({ transaction });
        await auditService.writeAuditLog({
            t_id: tid,
            entity_type: 'staff',
            entity_id: staff.id,
            action: 'delete',
            old_value: oldValue,
            new_value: null,
            operator_id: operator?.user_id
        }, { transaction });
    });
};

module.exports = {
    addStaff,
    listStaff,
    removeStaff
};
