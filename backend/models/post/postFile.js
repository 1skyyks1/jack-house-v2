const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db'); // 引入数据库配置

const PostFile = sequelize.define('PostFile', {
    file_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    post_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    file_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    file_url: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    storage_provider: {
        type: DataTypes.STRING(32),
        allowNull: true,
    },
    object_key: {
        type: DataTypes.STRING(255),
        allowNull: true,
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
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    uploaded_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    note: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0,
    },
    feedback: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    size: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    checksum: {
        type: DataTypes.STRING(64),
        allowNull: true,
    }
}, {
    tableName: 'post_file',
    timestamps: false,
});

module.exports = PostFile;
