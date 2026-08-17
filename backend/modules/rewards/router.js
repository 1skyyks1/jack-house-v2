const express = require('express');
const checkAuth = require('../../middleware/authMiddleware');
const { ROLES } = require('../../config/roles');
const service = require('./service');

const router = express.Router();
const adminOnly = checkAuth([ROLES.ADMIN]);

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.get('/me', checkAuth(), asyncRoute(async (req, res) => {
    res.json({ data: { balance: await service.getBalance(req.user.user_id) } });
}));

router.get('/items', checkAuth(), asyncRoute(async (req, res) => {
    res.json({ data: await service.listItems() });
}));

router.get('/ledger', checkAuth(), asyncRoute(async (req, res) => {
    res.json(await service.listLedger(req.user.user_id, req.query.page, req.query.pageSize));
}));

router.get('/orders', checkAuth(), asyncRoute(async (req, res) => {
    res.json(await service.listOrders({ userId: req.user.user_id, page: req.query.page, pageSize: req.query.pageSize }));
}));

router.post('/redeem', checkAuth(), asyncRoute(async (req, res) => {
    const order = await service.redeem(req.user.user_id, req.body || {});
    res.status(201).json({ data: order });
}));

router.get('/admin/items', adminOnly, asyncRoute(async (req, res) => {
    res.json({ data: await service.listItems({ admin: true }) });
}));

router.post('/admin/items', adminOnly, asyncRoute(async (req, res) => {
    const item = await service.RewardItem.create(normalizeItem(req.body));
    res.status(201).json({ data: item });
}));

router.put('/admin/items/:id', adminOnly, asyncRoute(async (req, res) => {
    const item = await service.RewardItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Reward item not found' });
    await item.update(normalizeItem(req.body));
    res.json({ data: item });
}));

router.get('/admin/ledger', adminOnly, asyncRoute(async (req, res) => {
    res.json(await service.listAdminLedger(req.query.page, req.query.pageSize));
}));

router.post('/admin/points', adminOnly, asyncRoute(async (req, res) => {
    const balance = await service.adminAdjustPoints(req.user.user_id, {
        userId: req.body.user_id,
        amount: req.body.amount,
        reason: req.body.reason,
    });
    res.status(201).json({ data: { balance } });
}));

router.get('/admin/orders', adminOnly, asyncRoute(async (req, res) => {
    res.json(await service.listOrders({ admin: true, page: req.query.page, pageSize: req.query.pageSize }));
}));

router.patch('/admin/order-items/:id', adminOnly, asyncRoute(async (req, res) => {
    const item = req.body.status === 'cancelled'
        ? await service.cancelOrderItem(req.user.user_id, req.params.id, req.body.detail)
        : await service.updateOrderItem(req.params.id, req.body);
    res.json({ data: item });
}));

function normalizeItem(body = {}) {
    const legacyName = cleanText(body.name, 120);
    const nameZh = cleanText(body.name_zh, 120) || legacyName;
    const nameEn = cleanText(body.name_en, 120) || legacyName;
    const type = body.type;
    const pointCost = Number(body.point_cost);
    const stock = Number(body.stock);
    if (!nameZh || !nameEn || !['virtual', 'physical'].includes(type) || !Number.isSafeInteger(pointCost) || pointCost <= 0 || !Number.isSafeInteger(stock) || stock < 0) {
        const error = new Error('Invalid reward item');
        error.status = 400;
        throw error;
    }
    const limit = body.limit_per_user === null || body.limit_per_user === '' || body.limit_per_user === undefined
        ? null
        : Number(body.limit_per_user);
    if (limit !== null && (!Number.isSafeInteger(limit) || limit <= 0)) {
        const error = new Error('Invalid redemption limit');
        error.status = 400;
        throw error;
    }
    const descriptionZh = cleanText(body.description_zh, 5000) || cleanText(body.description, 5000);
    const descriptionEn = cleanText(body.description_en, 5000) || cleanText(body.description, 5000);
    const idLabelZh = type === 'virtual' ? cleanText(body.id_label_zh, 80) || cleanText(body.id_label, 80) : null;
    const idLabelEn = type === 'virtual' ? cleanText(body.id_label_en, 80) || cleanText(body.id_label, 80) : null;
    const idPlaceholderZh = type === 'virtual' ? cleanText(body.id_placeholder_zh, 160) || cleanText(body.id_placeholder, 160) : null;
    const idPlaceholderEn = type === 'virtual' ? cleanText(body.id_placeholder_en, 160) || cleanText(body.id_placeholder, 160) : null;
    return {
        name: nameZh,
        name_zh: nameZh,
        name_en: nameEn,
        type,
        description: descriptionZh,
        description_zh: descriptionZh,
        description_en: descriptionEn,
        image_url: String(body.image_url || '').trim().slice(0, 1024) || null,
        point_cost: pointCost,
        stock,
        limit_per_user: limit,
        status: ['draft', 'active', 'inactive'].includes(body.status) ? body.status : 'draft',
        starts_at: body.starts_at || null,
        ends_at: body.ends_at || null,
        sort_order: Number.isSafeInteger(Number(body.sort_order)) ? Number(body.sort_order) : 0,
        id_label: idLabelZh,
        id_label_zh: idLabelZh,
        id_label_en: idLabelEn,
        id_placeholder: idPlaceholderZh,
        id_placeholder_zh: idPlaceholderZh,
        id_placeholder_en: idPlaceholderEn,
    };
}

function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) || null : null;
}

router.use((error, req, res, next) => {
    console.error('Rewards API error:', error);
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({ message: error.message || 'Rewards request failed', code: error.code });
});

module.exports = router;
