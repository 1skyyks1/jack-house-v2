const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Notice = sequelize.define('Notice', {
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    content_zh: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '中文富文本内容',
    },
    content_en: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '英文富文本内容',
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用展示',
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间',
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '更新时间',
    },
}, {
    tableName: 'notice',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
});

module.exports = Notice;
