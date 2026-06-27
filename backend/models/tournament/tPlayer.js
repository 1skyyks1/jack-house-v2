const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TPlayer = sequelize.define('TPlayer', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    team_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '队伍id'
    },
    t_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '赛事id，冗余自 team.t_id，用于同赛事唯一校验和查询'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户id'
    },
    user_name_snapshot: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '报名时用户名快照'
    },
    avatar_snapshot: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        comment: '报名时头像快照'
    },
    contact_qq: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '赛事联系方式 QQ'
    },
    contact_discord: {
        type: DataTypes.STRING(128),
        allowNull: true,
        comment: '赛事联系方式 Discord'
    },
    timezone: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '选手时区'
    },
    remark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '报名备注'
    },
    review_status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'review_pending',
        comment: 'review_pending/review_passed/review_failed'
    },
    is_captain: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '是否队长'
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    }
}, {
    tableName: 't_player',
    timestamps: false,
    indexes: [
        {
            unique: true,
            fields: ['t_id', 'user_id']
        },
        { fields: ['team_id', 'user_id'] },
        { fields: ['review_status'] }
    ]
});

module.exports = TPlayer;
