const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TMappoolStats = sequelize.define('TMappoolStats', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    t_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '赛事id'
    },
    stage: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: 'ro32/ro16/qf/sf/f/gf'
    },
    match_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    completed_match_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    valid_match_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    stats_json: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
        comment: '已发布的图池统计快照'
    },
    calculated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '计算统计的 user_id'
    },
    calculated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 't_mappool_stats',
    timestamps: false,
    indexes: [
        { unique: true, fields: ['t_id', 'stage'] },
        { fields: ['t_id', 'calculated_at'] }
    ]
});

module.exports = TMappoolStats;
