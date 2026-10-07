const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Post = sequelize.define('Post', {
    post_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: '帖子ID',
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '帖主ID',
    },
    type: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '帖子类型（0=普通帖子，1=征稿，2=活动，3=公告，4=悬赏）',
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间',
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '更新时间',
    },
    end: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '征稿或悬赏结束时间；悬赏为空表示永久'
    },
    bounty_closed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '悬赏手动结束时间',
    },
    limit: {
        type: DataTypes.TINYINT,
        allowNull: true,
        comment: '投稿数量限制'
    },
    folder_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    }
}, {
    tableName: 'post',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time'
});


module.exports = Post;
