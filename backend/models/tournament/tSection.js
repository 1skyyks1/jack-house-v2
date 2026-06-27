const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TSection = sequelize.define('TSection', {
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
    type: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: 'rules/description/prize/faq'
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '内容块标题'
    },
    format: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'markdown',
        comment: 'markdown/html'
    },
    source_markdown: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        comment: 'Markdown 原文'
    },
    content_html: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        comment: '渲染后的 HTML'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序'
    },
    updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后更新用户id'
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    }
}, {
    tableName: 't_section',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
    indexes: [
        { fields: ['t_id', 'type'] },
        { fields: ['t_id', 'sort_order'] }
    ]
});

module.exports = TSection;
