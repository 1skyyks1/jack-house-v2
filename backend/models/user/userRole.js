const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * 用户与系统角色关联中间表模型
 */
const UserRole = sequelize.define('UserRole', {
    user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
    },
    role_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
}, {
    tableName: 'user_roles',
    timestamps: false,
});

module.exports = UserRole;
