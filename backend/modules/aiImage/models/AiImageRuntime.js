const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const AiImageRuntime = sequelize.define('AiImageRuntime', {
    runtime_id: {
        type: DataTypes.TINYINT.UNSIGNED,
        primaryKey: true,
        defaultValue: 1,
    },
    updated_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'ai_image_runtime',
    timestamps: true,
    createdAt: false,
    updatedAt: 'updated_time',
});

module.exports = AiImageRuntime;
