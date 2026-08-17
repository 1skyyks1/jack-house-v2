const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Tag = sequelize.define('Tag', {
    tag_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '标签ID',
    },
    tag_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        comment: '标签名'
    },
    tag_key: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: '稳定标签标识'
    },
    category: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: 'pattern, bpm or difficulty'
    },
    name_zh: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '中文标签名'
    },
    name_en: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '英文标签名'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '分类内排序'
    },
    enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否可用于筛选和新关联'
    },
}, {
    tableName: 'tag',
    timestamps: false,
});

module.exports = Tag;
