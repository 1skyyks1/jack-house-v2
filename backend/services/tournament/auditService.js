const { TAuditLog, Tournament } = require('../../models/tournament');
const User = require('../../models/user/user');

const OMITTED_AUDIT_KEYS = new Set([
    'created_time',
    'updated_time',
    't_id',
    'operator_id',
    'updated_by'
]);
const SENSITIVE_AUDIT_KEY_PATTERN = /(?:password|secret|token|invite_code|contact_qq|contact_discord)/i;
const CONTENT_AUDIT_KEY_PATTERN = /^(?:source_markdown|content_html|rule_)(?:_|$)/i;
const LARGE_STRING_THRESHOLD = 2048;
const LARGE_ARRAY_THRESHOLD = 128;

const isPlainObject = value => value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof Date);

const normalizeAuditValue = (value) => {
    if (value === undefined || value === null) return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value?.toJSON === 'function') return normalizeAuditValue(value.toJSON());
    if (Array.isArray(value)) return value.map(normalizeAuditValue);
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeAuditValue(nested)]));
    }
    return value;
};

const shouldOmitAuditKey = key => OMITTED_AUDIT_KEYS.has(key) || SENSITIVE_AUDIT_KEY_PATTERN.test(key);

const compactSnapshot = (value, key = '') => {
    if (value === undefined || value === null) return value;
    if (typeof value === 'string' && (CONTENT_AUDIT_KEY_PATTERN.test(key) || value.length > LARGE_STRING_THRESHOLD)) {
        return { length: Buffer.byteLength(value, 'utf8') };
    }
    if (Array.isArray(value)) {
        if (value.length > LARGE_ARRAY_THRESHOLD) return { count: value.length };
        return value.map(item => compactSnapshot(item)).filter(item => item !== undefined);
    }
    if (isPlainObject(value)) {
        const compacted = {};
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
            if (shouldOmitAuditKey(nestedKey) || nestedValue === undefined || nestedValue === null) continue;
            const next = compactSnapshot(nestedValue, nestedKey);
            if (next !== undefined) compacted[nestedKey] = next;
        }
        return Object.keys(compacted).length > 0 ? compacted : undefined;
    }
    return value;
};

const valuesEqual = (left, right) => {
    if (left === right) return true;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch (_error) {
        return false;
    }
};

const compactDiff = (oldValue, newValue, key = '') => {
    if (valuesEqual(oldValue, newValue)) return [undefined, undefined];
    if (isPlainObject(oldValue) && isPlainObject(newValue)) {
        const compactOld = {};
        const compactNew = {};
        const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
        for (const nestedKey of keys) {
            if (shouldOmitAuditKey(nestedKey)) continue;
            const [oldNested, newNested] = compactDiff(oldValue[nestedKey], newValue[nestedKey], nestedKey);
            if (oldNested !== undefined) compactOld[nestedKey] = oldNested;
            if (newNested !== undefined) compactNew[nestedKey] = newNested;
        }
        return [
            Object.keys(compactOld).length > 0 ? compactOld : undefined,
            Object.keys(compactNew).length > 0 ? compactNew : undefined
        ];
    }
    return [compactSnapshot(oldValue, key), compactSnapshot(newValue, key)];
};

const compactAuditValues = (oldValue, newValue) => {
    const normalizedOld = normalizeAuditValue(oldValue);
    const normalizedNew = normalizeAuditValue(newValue);
    if (normalizedOld !== null && normalizedOld !== undefined && normalizedNew !== null && normalizedNew !== undefined) {
        const [compactOld, compactNew] = compactDiff(normalizedOld, normalizedNew);
        return { oldValue: compactOld ?? null, newValue: compactNew ?? null };
    }
    return {
        oldValue: compactSnapshot(normalizedOld) ?? null,
        newValue: compactSnapshot(normalizedNew) ?? null
    };
};

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
    const compacted = compactAuditValues(old_value, new_value);
    return TAuditLog.create({
        t_id,
        entity_type,
        entity_id: entity_id || null,
        action,
        old_value_json: safeStringify(compacted.oldValue),
        new_value_json: safeStringify(compacted.newValue),
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
        attributes: ['id', 't_id', 'entity_type', 'entity_id', 'action', 'operator_id', 'created_time'],
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

const getAuditLog = async (tid, auditId) => {
    const log = await TAuditLog.findOne({
        where: { id: auditId, t_id: tid },
        include: [{ model: User, as: 'operator', attributes: ['user_id', 'user_name', 'avatar'] }]
    });
    if (!log) {
        const error = new Error('审计日志不存在');
        error.status = 404;
        throw error;
    }
    return log;
};

module.exports = {
    compactAuditValues,
    getAuditLog,
    listAuditLogs,
    writeAuditLog,
    pickModelValues
};
