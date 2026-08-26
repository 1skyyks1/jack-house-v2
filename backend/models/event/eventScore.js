const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const EventScore = sequelize.define('EventScore', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '成绩ID'
    },
    stage_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '项目ID'
    },
    beatmap_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'osu beatmap ID'
    },
    event_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '活动ID，0表示活动外成绩'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
    },
    score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '分数'
    },
    accuracy: {
        type: DataTypes.DECIMAL(12, 10),
        allowNull: true,
        comment: '准确率（0-1）'
    },
    max_combo: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: '最大连击'
    },
    score_rank: {
        type: DataTypes.STRING(2),
        allowNull: true,
        comment: 'osu成绩评级'
    },
    statistics: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'osu判定统计'
    },
    mods: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'osu成绩Mods'
    },
    build_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: 'osu lazer客户端build ID，空表示stable'
    },
    osu_score_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: 'osu成绩ID'
    },
    played_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '游玩时间'
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间'
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '更新时间'
    }
},{
    tableName: 'event_score',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
    indexes: [
        { unique: true, fields: ['user_id', 'beatmap_id', 'event_id'], name: 'uq_event_score_scope' },
        { fields: ['beatmap_id', 'score'], name: 'idx_event_score_beatmap_score' },
        { fields: ['event_id', 'score'], name: 'idx_event_score_event_score' },
    ],
})

module.exports = EventScore;
