const { TAuditLog, Tournament } = require('../../models/tournament');
const User = require('../../models/user/user');

const safeStringify = (value) => {
    if (value === undefined) return null;
    if (value === null) return null;
    try {
        return JSON.stringify(value);
    } catch (error) {
        return JSON.stringify({ message: 'Failed to serialize audit value' });
    }
};

const pickModelValues = (model, fields) => {
    if (!model) return null;
    const raw = typeof model.toJSON === 'function' ? model.toJSON() : model;
    if (!fields) return raw;
    return fields.reduce((acc, field) => {
        acc[field] = raw[field];
        return acc;
    }, {});
};

const writeAuditLog = async ({ t_id, entity_type, entity_id, action, old_value, new_value, operator_id }, options = {}) => {
    if (!t_id || !entity_type || !action) return null;
    return TAuditLog.create({
        t_id,
        entity_type,
        entity_id: entity_id || null,
        action,
        old_value_json: safeStringify(old_value),
        new_value_json: safeStringify(new_value),
        operator_id: operator_id || null
    }, options);
};

const listAuditLogs = async (tid, query = {}) => {
    const tournament = await Tournament.findByPk(tid);
    if (!tournament) {
        const error = new Error('赛事不存在');
        error.status = 404;
        throw error;
    }

    const where = { t_id: tid };
    if (query.entity_type) where.entity_type = query.entity_type;
    if (query.entity_id) where.entity_id = query.entity_id;
    if (query.action) where.action = query.action;
    if (query.operator_id) where.operator_id = query.operator_id;

    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 30), 1), 100);
    const offset = (page - 1) * pageSize;

    const result = await TAuditLog.findAndCountAll({
        where,
        include: [{ model: User, as: 'operator', attributes: ['user_id', 'user_name', 'avatar'] }],
        order: [['created_time', 'DESC'], ['id', 'DESC']],
        limit: pageSize,
        offset
    });

    return {
        rows: result.rows,
        total: result.count,
        page,
        pageSize
    };
};

module.exports = {
    listAuditLogs,
    writeAuditLog,
    pickModelValues
};
