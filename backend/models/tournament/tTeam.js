const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TTeam = sequelize.define('TTeam', {
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
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '原始队名'
    },
    display_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '赛时使用名'
    },
    invite_code: {
        type: DataTypes.STRING(8),
        allowNull: true,
        unique: true,
        comment: '邀请码'
    },
    avatar: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        comment: '队伍头像，第一版可预留'
    },
    is_open: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '是否开放组队'
    },
    captain_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '队长user_id，兼容旧逻辑'
    },
    captain_player_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '队长player_id，长期队长关系以此字段为准'
    },
    status: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '兼容旧逻辑：0=created/pending 1=approved 2=reserved 3=locked'
    },
    qual_mp_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '资格赛MP房间id'
    },
    qual_rank: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '资格赛排名'
    },
    qual_score: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '资格赛总分'
    },
    locked_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '队伍锁定时间'
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
    tableName: 't_team',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time'
});

module.exports = TTeam;
