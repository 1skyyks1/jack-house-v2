const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Pack = sequelize.define('Pack', {
    pack_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        comment: '图包ID'
    },
    artist: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '曲师'
    },
    artist_unicode: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '曲师'
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '图包名'
    },
    title_unicode: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    creator: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '图包作者'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '上传者ID'
    },
    osu_bid: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
        comment: 'osu上的图包id'
    },
    other_url: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '其他下载url'
    },
    type: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '图包类型（0：练习包，1：综合包，2：段位类）'
    },
    status: {
        type: DataTypes.TINYINT,
        allowNull: true,
        comment: '图包状态（0：graveyard，1：wip，2：pending，3：ranked，4：approved，5：qualified，6：loved）'
    },
    last_updated: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    submitted_date: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    cover_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    is_recommended: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '管理员推荐',
    },
    recommended_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    recommended_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    is_original: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '叠屋出品',
    },
    original_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    original_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    leaderboard_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '启用站内Pack排行榜',
    },
    leaderboard_enabled_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    leaderboard_enabled_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '上传时间'
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '更新时间'
    },
},{
    tableName: 'pack',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
    indexes: [
        { fields: ['leaderboard_enabled'], name: 'idx_pack_leaderboard_enabled' },
    ],
});

module.exports = Pack;
