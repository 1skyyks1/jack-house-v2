const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TQualImport = sequelize.define('TQualImport', {
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
    team_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '队伍id'
    },
    mp_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'osu MP房间id'
    },
    status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'running',
        comment: 'running/success/failed'
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '导入消息或失败原因'
    },
    imported_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '导入者 user_id'
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    }
}, {
    tableName: 't_qual_import',
    timestamps: false,
    indexes: [
        { fields: ['t_id', 'team_id'] },
        { fields: ['mp_id'] },
        { fields: ['status'] }
    ]
});

module.exports = TQualImport;
