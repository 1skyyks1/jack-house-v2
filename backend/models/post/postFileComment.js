const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

/**
 * 投稿审稿人内部评论模型
 * 重要设计说明：该评论仅供审核团队内部协同沟通，不对普通投稿人公开
 */
const PostFileComment = sequelize.define('PostFileComment', {
    comment_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    file_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    comment: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'post_file_comment',
    timestamps: false,
});

module.exports = PostFileComment;
