const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TAuditLog = sequelize.define('TAuditLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    t_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '赛事id'
    },
    entity_type: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '操作对象类型'
    },
    entity_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作对象id'
    },
    action: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '操作类型'
    },
    old_value_json: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        comment: '旧值 JSON'
    },
    new_value_json: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        comment: '新值 JSON'
    },
    operator_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作者 user_id'
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    }
}, {
    tableName: 't_audit_log',
    timestamps: false,
    indexes: [
        { fields: ['t_id', 'created_time'] },
        { fields: ['entity_type', 'entity_id'] },
        { fields: ['operator_id'] }
    ]
});

module.exports = TAuditLog;
