const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Tournament = sequelize.define('Tournament', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '赛事正式名称'
    },
    acronym: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '赛事名称缩写'
    },
    desc_zh: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '赛事简介（中文）'
    },
    desc_en: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '赛事简介（英文）'
    },
    rule_zh: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '赛事规则（中文）'
    },
    rule_en: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '赛事规则（英文）'
    },
    banner: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '横幅图片'
    },
    team_size_min: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '队伍最少人数'
    },
    team_size_max: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
        comment: '队伍最大人数'
    },
    qual_top_n: {
        type: DataTypes.TINYINT,
        defaultValue: 32,
        comment: '资格赛前n晋级正赛'
    },
    qual_rank_mode: {
        type: DataTypes.TINYINT,
        defaultValue: 0,
        comment: '0=排名累加 1=加权分数'
    },
    reg_start: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '报名开始时间'
    },
    reg_end: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '报名结束时间'
    },
    qual_start: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '资格赛开始时间'
    },
    qual_end: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '资格赛结束时间'
    },
    qual_locked_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '资格赛排名锁定时间'
    },
    qual_locked_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '锁定资格赛排名的 user_id'
    },
    qual_locked_top_n: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '锁定时的晋级名额'
    },
    status: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '0=未开始 1=报名中 2=资格赛 3=正赛 4=已结束'
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建者 user_id；creator host 可删除赛事和添加其他 host'
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
    tableName: 'tournament',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time'
});

module.exports = Tournament;
