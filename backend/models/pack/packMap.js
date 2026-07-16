const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const PackMap = sequelize.define('PackMap', {
    map_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
    },
    beatmap_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    pack_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    rating: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    length: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    real_length: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    version: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    od: {
        type: DataTypes.DECIMAL(10, 1),
        allowNull: false,
    },
    hp: {
        type: DataTypes.DECIMAL(10, 1),
        allowNull: false,
    },
    bpm: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    key_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    ln_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
},{
    tableName: 'pack_map',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
});

module.exports = PackMap;
