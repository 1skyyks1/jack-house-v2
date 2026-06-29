const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const RichTextAssetReference = sequelize.define('RichTextAssetReference', {
    rich_text_asset_reference_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    rich_text_asset_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    content_type: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    content_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    source_url: {
        type: DataTypes.STRING(1024),
        allowNull: true,
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'rich_text_asset_reference',
    timestamps: false,
});

module.exports = RichTextAssetReference;
