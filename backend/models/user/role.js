const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * 系统角色模型
 * permissions 字段存储 JSON 格式的权限点字符串数组，
 * 采用 getter/setter 确保应用层始终以 Array 交互。
 */
const Role = sequelize.define('Role', {
    role_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    role_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
    },
    role_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    name_zh: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '中文显示名',
    },
    name_en: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '英文显示名',
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    permissions: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '[]',
        get() {
            const rawValue = this.getDataValue('permissions');
            if (!rawValue) return [];
            if (Array.isArray(rawValue)) return rawValue;
            try {
                return JSON.parse(rawValue);
            } catch (err) {
                return [];
            }
        },
        set(val) {
            this.setDataValue('permissions', Array.isArray(val) ? JSON.stringify(val) : (val || '[]'));
        }
    },
    is_system: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
}, {
    tableName: 'role',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
});

module.exports = Role;