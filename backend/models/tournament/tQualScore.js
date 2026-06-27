const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TQualScore = sequelize.define('TQualScore', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    map_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '资格赛图id'
    },
    team_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '队伍id'
    },
    player_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '选手id'
    },
    score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '分数'
    },
    attempt_no: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '资格赛尝试轮次'
    },
    source_mp_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '来源 osu MP id'
    },
    source_game_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '来源 osu MP game id'
    },
    import_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '导入批次id'
    },
    is_manual: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: '是否手动修正'
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    }
}, {
    tableName: 't_qual_score',
    timestamps: false,
    indexes: [
        { fields: ['team_id', 'map_id'] },
        { fields: ['import_id'] },
        { fields: ['source_mp_id'] }
    ]
});

module.exports = TQualScore;
