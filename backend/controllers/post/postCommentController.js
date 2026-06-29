const { PostComment, User} = require('../../models');
const { ROLES } = require('../../config/roles');

// 获取指定帖子的所有评论
exports.getCommentsByPostId = async (req, res) => {
    const { post_id } = req.params;
    const { page, pageSize } = req.query
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const { count, rows } = await PostComment.findAndCountAll({
            where: { post_id },
            limit,
            offset,
            order: [['created_time', 'DESC']],
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_name', 'role', 'avatar']
                }
            ]
        });

        const result = rows.map(comment => {
            const commentData = comment.toJSON();
            commentData.user_name = commentData.user.user_name;
            commentData.role = commentData.user.role;
            commentData.avatar = commentData.user.avatar
            delete commentData.user;
            return commentData
        })
        const totalPages = Math.ceil(count / limit)

        res.json({ data: result, page: parseInt(page, 10), pageSize: limit, totalPages, total: count });
    } catch (error) {
        res.status(500).json({ message: req.t('postComment.fetchFailed') });
    }
};

// 获取所有帖子所有评论
exports.getAllComments = async (req, res) => {
    const { page, pageSize } = req.query
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const { count, rows } = await PostComment.findAndCountAll({
            limit, offset, order: [['created_time', 'DESC']],
        });
        const totalPages = Math.ceil(count / limit)
        res.json({data: rows, page: parseInt(page, 10), pageSize: limit, totalPages, total: count});
    } catch (error) {
        res.status(500).json({ message: req.t('postComment.fetchFailed') });
    }
};

// 获取指定用户的所有投稿
exports.getCommentsByUserId = async (req, res) => {
    const { user_id } = req.params;
    const { page, pageSize } = req.query
    const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
    const limit = parseInt(pageSize, 10);
    try {
        const { count, rows } = await PostComment.findAndCountAll({
            where: { user_id },
            limit,
            offset,
            order: [['created_time', 'DESC']],
        });
        const totalPages = Math.ceil(count / limit);
        res.json({ data: rows, page: parseInt(page, 10), pageSize: limit, totalPages, total: count });
    } catch (error){
        res.status(500).json({ message: req.t('postComment.fetchFailed') });
    }
}


// 创建评论
exports.createComment = async (req, res) => {
    const { post_id, comment } = req.body;
    const user_id = req.user.user_id;
    try {
        const newComment = await PostComment.create({
            post_id,
            user_id,
            comment,
        });
        res.status(201).json({ message: req.t('postComment.createSuccess') });
    } catch (error) {
        res.status(500).json({ message: req.t('postComment.createFailed') });
    }
};

// 更新评论
exports.updateComment = async (req, res) => {
    const { comment_id } = req.params;
    const { comment } = req.body;
    try {
        const existingComment = await PostComment.findByPk(comment_id);
        if (!existingComment) {
            return res.status(404).json({ message: req.t('postComment.notFound') });
        }
        existingComment.comment = comment || existingComment.comment;
        await existingComment.save();
        res.json({ data: existingComment });
    } catch (error) {
        res.status(500).json({ message: req.t('postComment.updateFailed') });
    }
};

// 删除评论
exports.deleteComment = async (req, res) => {
    const { comment_id } = req.params;
    const user_id = req.user.user_id;
    const role = req.user.role;
    try {
        const comment = await PostComment.findByPk(comment_id);
        if (!comment) {
            return res.status(404).json({ message: req.t('postComment.notFound') });
        }
        const isAdmin = role === ROLES.ADMIN;
        const isOwner = comment.user_id === user_id;
        if (isAdmin || isOwner) {
            await comment.destroy();
            res.json({ message: req.t('postComment.deleteSuccess') });
        } else {
            res.status(403).json({ message: req.t('postComment.unauthorized') });
        }
    } catch (error) {
        res.status(500).json({ message: req.t('postComment.deleteFailed') });
    }
};
