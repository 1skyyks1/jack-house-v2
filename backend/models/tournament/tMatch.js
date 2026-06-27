const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TMatch = sequelize.define('TMatch', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    round_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '轮次id'
    },
    mp_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'osu MP房间id'
    },
    team1_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '红队'
    },
    team2_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '蓝队'
    },
    team1_roll: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '红队roll点'
    },
    team2_roll: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '蓝队roll点'
    },
    team1_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '红队胜场'
    },
    team2_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '蓝队胜场'
    },
    winner_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '胜者队伍id'
    },
    result_type: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'normal',
        comment: 'normal/wbd/ff'
    },
    result_note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'WBD/FF 或手动改判备注'
    },
    winner_overridden: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '胜方是否由 referee 手动修改'
    },
    is_possible: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: 'GF(P)标记'
    },
    bracket_group: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: 'winner/loser/grand_final/reset_final'
    },
    round_no: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '同 bracket group 内轮次序号'
    },
    slot_no: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '同轮次内位置'
    },
    source_match_1_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '队伍1来源比赛'
    },
    source_match_1_result: {
        type: DataTypes.STRING(16),
        allowNull: true,
        comment: 'winner/loser'
    },
    source_match_2_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '队伍2来源比赛'
    },
    source_match_2_result: {
        type: DataTypes.STRING(16),
        allowNull: true,
        comment: 'winner/loser'
    },
    hidden_until_match_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '隐藏到指定比赛完成后再展示'
    },
    scheduled_time: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '预定时间'
    },
    status: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '0=未开始 1=兼容旧进行中 2=已完成'
    },
    team1_timeout_used: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
    },
    team2_timeout_used: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
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
    tableName: 't_match',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time'
});

module.exports = TMatch;
