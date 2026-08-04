const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const PackFeedback = sequelize.define('PackFeedback', {
    feedback_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
    },
    pack_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    category: {
        type: DataTypes.STRING(32),
        allowNull: false,
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    status: {
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
    },
}, {
    tableName: 'pack_feedback',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
});

module.exports = PackFeedback;
