const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const RichTextAsset = sequelize.define('RichTextAsset', {
    rich_text_asset_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    storage_provider: {
        type: DataTypes.STRING(32),
        allowNull: false,
    },
    object_key: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
    },
    public_url: {
        type: DataTypes.STRING(1024),
        allowNull: true,
    },
    download_url: {
        type: DataTypes.STRING(1024),
        allowNull: true,
    },
    mime_type: {
        type: DataTypes.STRING(128),
        allowNull: true,
    },
    size: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    checksum: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'uploaded',
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    orphaned_time: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'rich_text_asset',
    timestamps: false,
});

module.exports = RichTextAsset;
