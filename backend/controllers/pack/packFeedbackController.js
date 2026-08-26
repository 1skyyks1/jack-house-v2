const { Pack, PackFeedback, User } = require('../../models');

const CATEGORIES = new Set([
    'incorrect_tag',
    'outdated_info',
    'duplicate',
    'copyright_or_violation',
    'other',
    // Keep accepting legacy values during rolling deployments.
    'incorrect_info',
    'broken_link',
    'inappropriate',
]);

exports.createFeedback = async (req, res) => {
    const packId = Number(req.params.pack_id);
    const userId = req.user.user_id;
    const category = String(req.body.category || '').trim();
    const content = String(req.body.content || '').trim();

    if (!Number.isInteger(packId) || packId <= 0 || !CATEGORIES.has(category) || content.length < 5 || content.length > 2000) {
        return res.status(400).json({ message: req.t('packFeedback.invalid') });
    }

    try {
        const pack = await Pack.findByPk(packId, { attributes: ['pack_id'] });
        if (!pack) {
            return res.status(404).json({ message: req.t('pack.notFound') });
        }

        const existingFeedback = await PackFeedback.findOne({
            where: { pack_id: packId, user_id: userId, category, status: 0 },
        });
        if (existingFeedback) {
            return res.status(409).json({ message: req.t('packFeedback.duplicate') });
        }

        const feedback = await PackFeedback.create({
            pack_id: packId,
            user_id: userId,
            category,
            content,
        });

        return res.status(201).json({
            data: { feedback_id: feedback.feedback_id },
            message: req.t('packFeedback.createSuccess'),
        });
    } catch (error) {
        return res.status(500).json({ message: req.t('packFeedback.createFailed') });
    }
};

exports.getFeedbackList = async (req, res) => {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(req.query.pageSize, 10) || 20, 1), 100);
    const status = req.query.status === undefined || req.query.status === '' ? null : Number(req.query.status);

    if (status !== null && ![0, 1, 2].includes(status)) {
        return res.status(400).json({ message: req.t('packFeedback.invalidStatus') });
    }

    try {
        const { count, rows } = await PackFeedback.findAndCountAll({
            where: status === null ? {} : { status },
            include: [
                { model: Pack, as: 'pack', attributes: ['pack_id', 'title', 'title_unicode', 'artist', 'artist_unicode'] },
                { model: User, as: 'user', attributes: ['user_id', 'user_name'] },
            ],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            order: [['created_time', 'DESC']],
        });

        return res.json({
            data: rows,
            page,
            pageSize,
            total: count,
            totalPages: Math.ceil(count / pageSize),
        });
    } catch (error) {
        return res.status(500).json({ message: req.t('packFeedback.getFailed') });
    }
};

exports.updateFeedbackStatus = async (req, res) => {
    const feedbackId = Number(req.params.feedback_id);
    const status = Number(req.body.status);

    if (!Number.isInteger(feedbackId) || feedbackId <= 0 || ![0, 1, 2].includes(status)) {
        return res.status(400).json({ message: req.t('packFeedback.invalidStatus') });
    }

    try {
        const feedback = await PackFeedback.findByPk(feedbackId);
        if (!feedback) {
            return res.status(404).json({ message: req.t('packFeedback.notFound') });
        }

        await feedback.update({ status });
        return res.json({ message: req.t('packFeedback.updateSuccess') });
    } catch (error) {
        return res.status(500).json({ message: req.t('packFeedback.updateFailed') });
    }
};
