const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TMatchAction = sequelize.define('TMatchAction', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    match_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '比赛id'
    },
    action_type: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: 'roll/protect/ban/pick/score_import/score_edit/timeout/note'
    },
    team_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '执行队伍id'
    },
    map_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联正赛图池id'
    },
    value_json: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '操作扩展数据 JSON'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '时间线顺序'
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作者 user_id'
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
    tableName: 't_match_action',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
    indexes: [
        { fields: ['match_id', 'sort_order'] },
        { fields: ['match_id', 'action_type'] },
        { fields: ['map_id'] }
    ]
});

module.exports = TMatchAction;
