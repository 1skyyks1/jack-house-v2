const { Op } = require('sequelize');
const sequelize = require('../config/db');
const Notice = require('../models/notice');
const { syncRichTextAssetReferences } = require('../services/richTextAssetService');
const { sanitizeRichTextHtml } = require('../utils/richTextSanitizer');

const NOTICE_CONTENT_TYPE = 'notice';

const createHttpError = (status, message) => Object.assign(new Error(message), { status });

const sanitizeNoticeContent = (value) => sanitizeRichTextHtml(value || '');

const hasNoticeContent = (html) => {
    if (/<img\b[^>]*>/i.test(html)) return true;
    return Boolean(html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim());
};

const validateNoticeContents = (contentZh, contentEn) => {
    if (!hasNoticeContent(contentZh) && !hasNoticeContent(contentEn)) {
        throw createHttpError(400, 'At least one language content is required');
    }
};

const syncNoticeAssets = ({ notice, transaction, deleted = false }) => syncRichTextAssetReferences({
    contentType: NOTICE_CONTENT_TYPE,
    contentId: notice.id,
    html: deleted ? '' : `${notice.content_zh}\n${notice.content_en}`,
    transaction,
});

const deactivateOtherNotices = (noticeId, transaction) => Notice.update({
    is_active: false,
}, {
    where: {
        is_active: true,
        id: { [Op.ne]: noticeId },
    },
    transaction,
});

/**
 * 获取当前最新启用的通知（公开接口，免认证）
 */
exports.getActiveNotice = async (req, res) => {
    try {
        const notice = await Notice.findOne({
            where: { is_active: true },
            order: [['id', 'DESC']],
        });
        return res.status(200).json({ data: notice || null });
    } catch (error) {
        console.error('Failed to get active notice:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * 获取通知列表（后台管理，分页）
 */
exports.getAllNotices = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
        const offset = (page - 1) * pageSize;

        const { count, rows } = await Notice.findAndCountAll({
            order: [['id', 'DESC']],
            limit: pageSize,
            offset,
        });

        return res.status(200).json({
            data: rows,
            total: count,
            page,
            pageSize,
            totalPages: Math.ceil(count / pageSize),
        });
    } catch (error) {
        console.error('Failed to get notices:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * 创建新通知（后台管理）
 */
exports.createNotice = async (req, res) => {
    try {
        const contentZh = sanitizeNoticeContent(req.body.content_zh);
        const contentEn = sanitizeNoticeContent(req.body.content_en);
        validateNoticeContents(contentZh, contentEn);
        const shouldActivate = req.body.is_active !== undefined ? Boolean(req.body.is_active) : true;

        const notice = await sequelize.transaction(async (transaction) => {
            const created = await Notice.create({
                content_zh: contentZh,
                content_en: contentEn,
                is_active: false,
            }, { transaction });

            if (shouldActivate) {
                await deactivateOtherNotices(created.id, transaction);
                created.is_active = true;
                await created.save({ transaction });
            }

            await syncNoticeAssets({ notice: created, transaction });
            return created;
        });

        return res.status(201).json({ data: notice });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        console.error('Failed to create notice:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * 更新通知（后台管理）
 */
exports.updateNotice = async (req, res) => {
    try {
        const notice = await sequelize.transaction(async (transaction) => {
            const current = await Notice.findByPk(req.params.id, {
                lock: transaction.LOCK.UPDATE,
                transaction,
            });
            if (!current) throw createHttpError(404, 'Notice not found');

            const contentZh = req.body.content_zh === undefined
                ? current.content_zh
                : sanitizeNoticeContent(req.body.content_zh);
            const contentEn = req.body.content_en === undefined
                ? current.content_en
                : sanitizeNoticeContent(req.body.content_en);
            validateNoticeContents(contentZh, contentEn);

            current.content_zh = contentZh;
            current.content_en = contentEn;

            if (req.body.is_active !== undefined) {
                const shouldActivate = Boolean(req.body.is_active);
                if (shouldActivate) await deactivateOtherNotices(current.id, transaction);
                current.is_active = shouldActivate;
            }

            await current.save({ transaction });
            await syncNoticeAssets({ notice: current, transaction });
            return current;
        });

        return res.status(200).json({ data: notice });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        console.error('Failed to update notice:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * 删除通知（后台管理）
 */
exports.deleteNotice = async (req, res) => {
    try {
        await sequelize.transaction(async (transaction) => {
            const notice = await Notice.findByPk(req.params.id, {
                lock: transaction.LOCK.UPDATE,
                transaction,
            });
            if (!notice) throw createHttpError(404, 'Notice not found');

            await syncNoticeAssets({ notice, transaction, deleted: true });
            await notice.destroy({ transaction });
        });

        return res.status(200).json({ message: 'Notice deleted successfully' });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        console.error('Failed to delete notice:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
