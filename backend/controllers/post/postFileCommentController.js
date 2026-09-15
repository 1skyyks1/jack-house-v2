const { PostFile, PostFileComment, User } = require('../../models');
const { can } = require('../../utils/permissions');

/**
 * 获取指定投稿附件的所有内部审稿人讨论意见
 * 重要设计说明：该接口仅供具备 postFiles 审核权限的人员访问，确保审稿人沟通私密性
 */
exports.getPostFileComments = async (req, res) => {
    const fileId = Number(req.params.file_id);
    if (!Number.isInteger(fileId) || fileId <= 0) {
        return res.status(400).json({ message: req.t('postFile.invalidId') || 'Invalid file ID' });
    }

    try {
        const comments = await PostFileComment.findAll({
            where: { file_id: fileId },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_id', 'user_name', 'avatar'],
                },
            ],
            order: [['created_time', 'ASC']],
        });

        res.status(200).json({ data: comments });
    } catch (error) {
        console.error('Failed to get post file comments:', error);
        res.status(500).json({ message: req.t('postFile.getCommentsFailed') || 'Failed to get comments' });
    }
};

/**
 * 审稿人发表一条内部意见
 */
exports.createPostFileComment = async (req, res) => {
    const fileId = Number(req.params.file_id);
    const userId = req.user.user_id;
    const commentText = String(req.body.comment || '').trim();

    if (!Number.isInteger(fileId) || fileId <= 0) {
        return res.status(400).json({ message: req.t('postFile.invalidId') || 'Invalid file ID' });
    }

    if (!commentText || commentText.length > 2000) {
        return res.status(400).json({ message: req.t('postFile.invalidComment') || 'Invalid comment content' });
    }

    try {
        const postFile = await PostFile.findByPk(fileId);
        if (!postFile) {
            return res.status(404).json({ message: req.t('postFile.notFound') || 'Submission not found' });
        }

        const created = await PostFileComment.create({
            file_id: fileId,
            user_id: userId,
            comment: commentText,
        });

        const commentWithUser = await PostFileComment.findByPk(created.comment_id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_id', 'user_name', 'avatar'],
                },
            ],
        });

        res.status(201).json({
            data: commentWithUser,
            message: req.t('postFile.commentCreated') || 'Comment created',
        });
    } catch (error) {
        console.error('Failed to create post file comment:', error);
        res.status(500).json({ message: req.t('postFile.createCommentFailed') || 'Failed to create comment' });
    }
};

/**
 * 删除审稿人内部意见（本人或超级管理员）
 */
exports.deletePostFileComment = async (req, res) => {
    const commentId = Number(req.params.comment_id);
    const userId = req.user.user_id;

    if (!Number.isInteger(commentId) || commentId <= 0) {
        return res.status(400).json({ message: req.t('postFile.invalidId') || 'Invalid comment ID' });
    }

    try {
        const comment = await PostFileComment.findByPk(commentId);
        if (!comment) {
            return res.status(404).json({ message: req.t('postFile.commentNotFound') || 'Comment not found' });
        }

        const isOwner = comment.user_id === userId;
        const isAdmin = can(req, 'all');

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: req.t('postFile.deleteForbidden') || 'Permission denied' });
        }

        await comment.destroy();
        res.status(200).json({ message: req.t('postFile.commentDeleted') || 'Comment deleted' });
    } catch (error) {
        console.error('Failed to delete post file comment:', error);
        res.status(500).json({ message: req.t('postFile.deleteCommentFailed') || 'Failed to delete comment' });
    }
};
