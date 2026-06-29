const { PackComment, Pack, User } = require('../../models');
const { ROLES } = require("../../config/roles");

// 在图包下发表评论
exports.addComment = async (req, res) => {
    try {
        const { pack_id, content } = req.body;
        const user_id = req.user.user_id;
        if (!content) {
            return res.status(400).json({ message: req.t('packComment.empty') });
        }

        const pack = await Pack.findByPk(pack_id);
        if (!pack) {
            return res.status(404).json({ message: req.t('packComment.notFound') });
        }

        const newComment = await PackComment.create({
            pack_id,
            user_id,
            content
        });
        res.status(201).json({ message: req.t('packComment.createSuccess') });
    } catch (error) {
        res.status(500).json({ message: req.t('packComment.createFailed') });
    }
};

// 查询图包评论
exports.getCommentsByPackId = async (req, res) => {
    try {
        const { pack_id } = req.params;
        const { page, pageSize } = req.query;
        const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
        const limit = parseInt(pageSize, 10);

        const { count, rows } = await PackComment.findAndCountAll({
            where: { pack_id },
            limit,
            offset,
            order: [['created_time', 'DESC']],
            include: [{
                model: User,
                as: 'user',
                attributes: ['user_id', 'user_name', 'avatar']
            }]
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

        res.status(200).json({
            total: count,
            totalPages,
            pageSize: limit,
            page: parseInt(page, 10),
            data: result
        });

    } catch (error) {
        res.status(500).json({ message: req.t('packComment.getFailed') });
    }
};

// 删除评论
exports.deleteComment = async (req, res) => {
    const { comment_id } = req.params;
    const user_id = req.user.user_id;
    const role = req.user.role;
    try {
        const comment = await PackComment.findByPk(comment_id);
        if (!comment) {
            return res.status(404).json({ message: req.t('packComment.commentNotExist') });
        }
        const isAdmin = role === ROLES.ADMIN;
        const isOwner = comment.user_id === user_id;
        if (isAdmin || isOwner) {
            await comment.destroy();
            res.json({ message: req.t('packComment.deleteSuccess') });
        } else {
            res.status(403).json({ message: req.t('packComment.noPermission') });
        }
    } catch (error) {
        res.status(500).json({ message: req.t('packComment.deleteFailed') });
    }
};
