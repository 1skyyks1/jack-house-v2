const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const EventStage = sequelize.define('EventStage', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '项目ID'
    },
    event_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '活动ID'
    },
    map_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '图BID'
    },
    artist: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "曲师",
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "曲名",
    },
    mapper: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "谱师",
    },
    minio_bg: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "minio文件名",
    },
    storage_provider: {
        type: DataTypes.STRING(32),
        allowNull: true,
        comment: 'storage provider',
    },
    object_key: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'storage object key',
    },
    public_url: {
        type: DataTypes.STRING(512),
        allowNull: true,
        comment: 'public url',
    },
    download_url: {
        type: DataTypes.STRING(512),
        allowNull: true,
        comment: 'download url',
    },
    mime_type: {
        type: DataTypes.STRING(128),
        allowNull: true,
        comment: 'mime type',
    },
    checksum: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'sha256 checksum',
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '上传时间'
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '更新时间'
    }
},{
    tableName: 'event_stage',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
})

module.exports = EventStage;
