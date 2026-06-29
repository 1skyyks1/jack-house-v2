const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const HomeImg = sequelize.define('HomeImg', {
    img_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '头图ID',
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
    },
    url: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '图片链接',
    },
    minio_img_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'minio侧文件名'
    },
    storage_provider: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: '存储 provider',
    },
    object_key: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '存储对象 key',
    },
    public_url: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        comment: '公开访问 URL',
    },
    download_url: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        comment: '下载 URL',
    },
    mime_type: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'MIME 类型',
    },
    redirect_url: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '跳转链接',
    },
    sort_order: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '排序 (0=未启用，1=第一张，2=第二张，3=第三张)',
    },
    description: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '图片内容注释',
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间',
    },
}, {
    tableName: 'home_img',
    timestamps: false,
})

module.exports = HomeImg
