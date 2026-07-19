const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/db');

const AiImageJob = sequelize.define('AiImageJob', {
    ai_image_job_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
    },
    public_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    upstream_job_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
    },
    idempotency_key: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    request_type: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'generation',
    },
    prompt: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
    },
    model: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'gpt-image-2',
    },
    size: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: '1024x1024',
    },
    reference_count: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
    },
    reference_metadata: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    has_mask: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    mask_metadata: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'submitting',
    },
    quota_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    quota_units: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
    },
    quota_refunded: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    cost_usd: {
        type: DataTypes.DECIMAL(12, 6),
        allowNull: true,
    },
    error_code: {
        type: DataTypes.STRING(96),
        allowNull: true,
    },
    error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    source_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
    },
    user_agent: {
        type: DataTypes.STRING(512),
        allowNull: true,
    },
    upstream_created_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    started_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    finished_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    created_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    updated_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'ai_image_job',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
    indexes: [
        { fields: ['user_id', 'idempotency_key'], unique: true },
        { fields: ['user_id', 'created_time'] },
        { fields: ['status', 'created_time'] },
        { fields: ['quota_date', 'user_id'] },
    ],
});

module.exports = AiImageJob;
