const { TStaff, TPlayer } = require('../../models/tournament');
const User = require('../../models/user/user');
const auditService = require('./auditService');

const STAFF_ROLES = new Set(['host', 'referee', 'pooler', 'streamer', 'commentator']);

const makeError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const canManageHost = (operator, tournament) => {
    return operator?.role === 2 || Number(tournament?.created_by) === Number(operator?.user_id);
};

const listStaff = async (tid) => {
    return TStaff.findAll({
        where: { t_id: tid },
        include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar'] }]
    });
};

const addStaff = async (tid, body, operator, tournament) => {
    const userId = Number(body.user_id);
    const role = body.role;

    if (!Number.isInteger(userId)) {
        throw makeError('用户 ID 无效');
    }
    if (!STAFF_ROLES.has(role)) {
        throw makeError('无效的角色');
    }
    if (role === 'host' && !canManageHost(operator, tournament)) {
        throw makeError('只有创建者 host 可以添加其他 host', 403);
    }

    const user = await User.findByPk(userId, { attributes: ['user_id'] });
    if (!user) {
        throw makeError('用户不存在', 404);
    }

    const existingPlayer = await TPlayer.findOne({ where: { t_id: tid, user_id: userId } });
    if (existingPlayer) {
        throw makeError('该用户已参赛，请先由 host 手动处理队伍/选手记录后再添加 staff');
    }

    const existing = await TStaff.findOne({ where: { t_id: tid, user_id: userId, role } });
    if (existing) {
        throw makeError('该用户已拥有此角色');
    }

    const staff = await TStaff.create({ t_id: tid, user_id: userId, role });
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'staff',
        entity_id: staff.id,
        action: 'create',
        old_value: null,
        new_value: auditService.pickModelValues(staff),
        operator_id: operator?.user_id
    });

    return staff;
};

const removeStaff = async (tid, staffId, operator, tournament) => {
    const staff = await TStaff.findOne({ where: { id: staffId, t_id: tid } });
    if (!staff) {
        throw makeError('Staff 不存在', 404);
    }
    if (staff.role === 'host' && !canManageHost(operator, tournament)) {
        throw makeError('只有创建者 host 可以移除 host', 403);
    }

    const oldValue = auditService.pickModelValues(staff);
    await staff.destroy();
    await auditService.writeAuditLog({
        t_id: tid,
        entity_type: 'staff',
        entity_id: staff.id,
        action: 'delete',
        old_value: oldValue,
        new_value: null,
        operator_id: operator?.user_id
    });
};

module.exports = {
    addStaff,
    listStaff,
    removeStaff
};
