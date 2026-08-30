const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const PackScore = sequelize.define('PackScore', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    pack_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    beatmap_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    score: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    accuracy: {
        type: DataTypes.DECIMAL(12, 10),
        allowNull: true,
    },
    max_combo: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
    },
    score_rank: {
        type: DataTypes.STRING(2),
        allowNull: true,
    },
    statistics: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    mods: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    build_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
    },
    osu_score_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
    },
    played_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
}, {
    tableName: 'pack_score',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
    indexes: [
        { unique: true, fields: ['user_id', 'pack_id', 'beatmap_id'], name: 'uq_pack_score_scope' },
        { fields: ['pack_id', 'beatmap_id', 'score'], name: 'idx_pack_score_leaderboard' },
    ],
});

module.exports = PackScore;
