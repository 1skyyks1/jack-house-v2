const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const User = require('../../models/user/user');
const {
    PointAccount,
    PointTransaction,
    RewardItem,
    RedemptionOrder,
    RedemptionOrderItem,
} = require('./models');

const ACTIVE_ITEM_WHERE = {
    status: 'active',
    [Op.and]: [
        { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: new Date() } }] },
        { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: new Date() } }] },
    ],
};

function asSafeInteger(value, name, { min = Number.MIN_SAFE_INTEGER } = {}) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min) {
        const error = new Error(`Invalid ${name}`);
        error.status = 400;
        throw error;
    }
    return parsed;
}

function makeOrderNumber(userId) {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    return `RW${stamp}${String(userId).padStart(6, '0')}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

async function getOrCreateAccount(userId, transaction, lock = false) {
    let account = await PointAccount.findByPk(userId, {
        transaction,
        lock: lock ? transaction.LOCK.UPDATE : undefined,
    });
    if (!account) {
        try {
            account = await PointAccount.create({ user_id: userId, balance: 0 }, { transaction });
        } catch (error) {
            if (error.name !== 'SequelizeUniqueConstraintError') throw error;
            account = await PointAccount.findByPk(userId, {
                transaction,
                lock: lock ? transaction.LOCK.UPDATE : undefined,
            });
        }
    }
    return account;
}

async function changeBalance({ userId, amount, type, reason, orderId = null, operatorId = null, transaction }) {
    const normalizedAmount = asSafeInteger(amount, 'amount');
    if (normalizedAmount === 0) {
        const error = new Error('Point amount cannot be zero');
        error.status = 400;
        throw error;
    }
    const account = await getOrCreateAccount(userId, transaction, true);
    const currentBalance = Number(account.balance);
    const nextBalance = currentBalance + normalizedAmount;
    if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
        const error = new Error('Insufficient points');
        error.status = 409;
        error.code = 'INSUFFICIENT_POINTS';
        throw error;
    }
    await account.update({ balance: nextBalance }, { transaction });
    await PointTransaction.create({
        user_id: userId,
        amount: normalizedAmount,
        balance_after: nextBalance,
        type,
        reason,
        order_id: orderId,
        operator_id: operatorId,
    }, { transaction });
    return nextBalance;
}

async function getBalance(userId) {
    const account = await PointAccount.findByPk(userId);
    return Number(account?.balance || 0);
}

async function listLedger(userId, page = 1, pageSize = 20) {
    const safePage = Math.max(asSafeInteger(page, 'page', { min: 1 }), 1);
    const safePageSize = Math.min(asSafeInteger(pageSize, 'pageSize', { min: 1 }), 100);
    const { count, rows } = await PointTransaction.findAndCountAll({
        where: { user_id: userId },
        order: [['id', 'DESC']],
        limit: safePageSize,
        offset: (safePage - 1) * safePageSize,
    });
    return { data: rows, page: safePage, pageSize: safePageSize, total: count, totalPages: Math.ceil(count / safePageSize) };
}

async function listItems({ admin = false } = {}) {
    return RewardItem.findAll({
        where: admin ? undefined : ACTIVE_ITEM_WHERE,
        order: [['sort_order', 'DESC'], ['id', 'DESC']],
    });
}

async function getPurchasedCounts(userId, rewardItemIds, transaction) {
    if (rewardItemIds.length === 0) return new Map();
    const rows = await RedemptionOrderItem.findAll({
        attributes: ['reward_item_id', [sequelize.fn('SUM', sequelize.col('quantity')), 'quantity']],
        include: [{ model: RedemptionOrder, as: 'order', attributes: [], where: { user_id: userId } }],
        where: {
            reward_item_id: { [Op.in]: rewardItemIds },
            fulfillment_status: { [Op.ne]: 'cancelled' },
        },
        group: ['reward_item_id'],
        transaction,
        raw: true,
    });
    return new Map(rows.map((row) => [Number(row.reward_item_id), Number(row.quantity)]));
}

async function redeem(userId, payload) {
    if (!Array.isArray(payload.items) || payload.items.length === 0 || payload.items.length > 50) {
        const error = new Error('Cart is empty');
        error.status = 400;
        throw error;
    }
    const normalizedItems = payload.items.map((item) => ({
        rewardItemId: asSafeInteger(item.rewardItemId, 'rewardItemId', { min: 1 }),
        quantity: asSafeInteger(item.quantity, 'quantity', { min: 1 }),
        expectedUnitPoints: asSafeInteger(item.expectedUnitPoints, 'expectedUnitPoints', { min: 1 }),
        virtualId: typeof item.virtualId === 'string' ? item.virtualId.trim().slice(0, 160) : '',
        remark: typeof item.remark === 'string' ? item.remark.trim().slice(0, 500) : '',
    }));
    if (new Set(normalizedItems.map((item) => item.rewardItemId)).size !== normalizedItems.length) {
        const error = new Error('Duplicate cart item');
        error.status = 400;
        throw error;
    }

    return sequelize.transaction(async (transaction) => {
        const itemIds = normalizedItems.map((item) => item.rewardItemId);
        const products = await RewardItem.findAll({
            where: { id: { [Op.in]: itemIds } },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        const productMap = new Map(products.map((item) => [item.id, item]));
        const purchasedCounts = await getPurchasedCounts(userId, itemIds, transaction);
        let totalPoints = 0;
        let hasPhysical = false;

        for (const cartItem of normalizedItems) {
            const product = productMap.get(cartItem.rewardItemId);
            const now = Date.now();
            if (!product || product.status !== 'active' || (product.starts_at && new Date(product.starts_at).getTime() > now) || (product.ends_at && new Date(product.ends_at).getTime() < now)) {
                const error = new Error('Reward item is not available');
                error.status = 409;
                error.code = 'ITEM_UNAVAILABLE';
                throw error;
            }
            if (Number(product.stock) < cartItem.quantity) {
                const error = new Error('Insufficient stock');
                error.status = 409;
                error.code = 'INSUFFICIENT_STOCK';
                throw error;
            }
            if (Number(product.point_cost) !== cartItem.expectedUnitPoints) {
                const error = new Error('Reward item price changed');
                error.status = 409;
                error.code = 'ITEM_CHANGED';
                throw error;
            }
            if (product.limit_per_user && (purchasedCounts.get(product.id) || 0) + cartItem.quantity > product.limit_per_user) {
                const error = new Error('Redemption limit exceeded');
                error.status = 409;
                error.code = 'LIMIT_EXCEEDED';
                throw error;
            }
            if (product.type === 'virtual' && !cartItem.virtualId) {
                const error = new Error('Virtual item ID is required');
                error.status = 400;
                throw error;
            }
            if (product.type === 'physical') hasPhysical = true;
            totalPoints += Number(product.point_cost) * cartItem.quantity;
        }

        const recipient = typeof payload.shipping?.recipient === 'string' ? payload.shipping.recipient.trim().slice(0, 80) : '';
        const contact = typeof payload.shipping?.contact === 'string' ? payload.shipping.contact.trim().slice(0, 40) : '';
        const address = typeof payload.shipping?.address === 'string' ? payload.shipping.address.trim().slice(0, 500) : '';
        const shippingRemark = typeof payload.shipping?.remark === 'string' ? payload.shipping.remark.trim().slice(0, 500) : '';
        if (hasPhysical && (!recipient || !contact || !address)) {
            const error = new Error('Shipping information is required');
            error.status = 400;
            throw error;
        }

        const order = await RedemptionOrder.create({
            order_no: makeOrderNumber(userId),
            user_id: userId,
            total_points: totalPoints,
            recipient: recipient || null,
            contact: contact || null,
            address: address || null,
            shipping_remark: shippingRemark || null,
        }, { transaction });

        await changeBalance({
            userId,
            amount: -totalPoints,
            type: 'redeem',
            reason: `兑换订单 ${order.order_no}`,
            orderId: order.id,
            transaction,
        });

        for (const cartItem of normalizedItems) {
            const product = productMap.get(cartItem.rewardItemId);
            const [updated] = await RewardItem.update(
                { stock: sequelize.literal(`stock - ${cartItem.quantity}`) },
                { where: { id: product.id, stock: { [Op.gte]: cartItem.quantity } }, transaction },
            );
            if (updated !== 1) {
                const error = new Error('Insufficient stock');
                error.status = 409;
                error.code = 'INSUFFICIENT_STOCK';
                throw error;
            }
            await RedemptionOrderItem.create({
                order_id: order.id,
                reward_item_id: product.id,
                item_name: product.name,
                item_name_zh: product.name_zh || product.name,
                item_name_en: product.name_en || product.name,
                item_type: product.type,
                image_url: product.image_url,
                unit_points: product.point_cost,
                quantity: cartItem.quantity,
                subtotal_points: Number(product.point_cost) * cartItem.quantity,
                virtual_id: product.type === 'virtual' ? cartItem.virtualId : null,
                remark: cartItem.remark || null,
            }, { transaction });
        }
        return getOrder(order.id, userId, transaction);
    });
}

async function getOrder(orderId, userId, transaction) {
    return RedemptionOrder.findOne({
        where: { id: orderId, ...(userId ? { user_id: userId } : {}) },
        include: [{ model: RedemptionOrderItem, as: 'items' }],
        transaction,
    });
}

async function listOrders({ userId, page = 1, pageSize = 20, admin = false }) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const result = await RedemptionOrder.findAndCountAll({
        where: admin ? undefined : { user_id: userId },
        include: [
            { model: RedemptionOrderItem, as: 'items' },
            ...(admin ? [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar'] }] : []),
        ],
        distinct: true,
        order: [['id', 'DESC']],
        limit: safePageSize,
        offset: (safePage - 1) * safePageSize,
    });
    return { data: result.rows, page: safePage, pageSize: safePageSize, total: result.count, totalPages: Math.ceil(result.count / safePageSize) };
}

async function adminAdjustPoints(operatorId, { userId, amount, reason }) {
    const targetUserId = asSafeInteger(userId, 'userId', { min: 1 });
    const target = await User.findByPk(targetUserId);
    if (!target) {
        const error = new Error('User not found');
        error.status = 404;
        throw error;
    }
    const safeReason = typeof reason === 'string' ? reason.trim().slice(0, 255) : '';
    if (!safeReason) {
        const error = new Error('Reason is required');
        error.status = 400;
        throw error;
    }
    return sequelize.transaction((transaction) => changeBalance({
        userId: targetUserId,
        amount,
        type: Number(amount) > 0 ? 'admin_grant' : 'admin_deduct',
        reason: safeReason,
        operatorId,
        transaction,
    }));
}

async function listAdminLedger(page = 1, pageSize = 30) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Number(pageSize) || 30, 1), 100);
    const { count, rows } = await PointTransaction.findAndCountAll({
        include: [{ model: User, as: 'user', attributes: ['user_id', 'user_name', 'avatar'] }],
        order: [['id', 'DESC']],
        limit: safePageSize,
        offset: (safePage - 1) * safePageSize,
    });
    return { data: rows, page: safePage, pageSize: safePageSize, total: count, totalPages: Math.ceil(count / safePageSize) };
}

async function cancelOrderItem(operatorId, orderItemId, detail) {
    return sequelize.transaction(async (transaction) => {
        const item = await RedemptionOrderItem.findByPk(orderItemId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!item) {
            const error = new Error('Order item not found');
            error.status = 404;
            throw error;
        }
        if (item.fulfillment_status === 'cancelled') return item;
        if (item.fulfillment_status === 'completed') {
            const error = new Error('Completed item cannot be cancelled');
            error.status = 409;
            throw error;
        }
        const order = await RedemptionOrder.findByPk(item.order_id, { transaction, lock: transaction.LOCK.UPDATE });
        await changeBalance({
            userId: order.user_id,
            amount: Number(item.subtotal_points),
            type: 'refund',
            reason: `兑换退款 ${order.order_no} / ${item.item_name}`,
            orderId: order.id,
            operatorId,
            transaction,
        });
        await RewardItem.increment('stock', { by: Number(item.quantity), where: { id: item.reward_item_id }, transaction });
        await item.update({ fulfillment_status: 'cancelled', fulfillment_detail: String(detail || '').slice(0, 500) || null }, { transaction });
        await refreshOrderStatus(order.id, transaction);
        return item;
    });
}

async function updateOrderItem(orderItemId, { status, detail }) {
    if (!['pending', 'processing', 'completed'].includes(status)) {
        const error = new Error('Invalid fulfillment status');
        error.status = 400;
        throw error;
    }
    return sequelize.transaction(async (transaction) => {
        const item = await RedemptionOrderItem.findByPk(orderItemId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!item) {
            const error = new Error('Order item not found');
            error.status = 404;
            throw error;
        }
        if (item.fulfillment_status === 'cancelled') {
            const error = new Error('Cancelled item cannot be changed');
            error.status = 409;
            throw error;
        }
        await item.update({ fulfillment_status: status, fulfillment_detail: String(detail || '').trim().slice(0, 500) || null }, { transaction });
        await refreshOrderStatus(item.order_id, transaction);
        return item;
    });
}

async function refreshOrderStatus(orderId, transaction) {
    const items = await RedemptionOrderItem.findAll({ where: { order_id: orderId }, transaction });
    const statuses = items.map((item) => item.fulfillment_status);
    const status = statuses.every((value) => value === 'cancelled')
        ? 'cancelled'
        : statuses.every((value) => ['completed', 'cancelled'].includes(value))
            ? 'completed'
            : statuses.some((value) => value === 'processing' || value === 'completed' || value === 'cancelled')
                ? 'processing'
                : 'pending';
    await RedemptionOrder.update({ status }, { where: { id: orderId }, transaction });
}

RedemptionOrder.hasMany(RedemptionOrderItem, { foreignKey: 'order_id', as: 'items' });
RedemptionOrderItem.belongsTo(RedemptionOrder, { foreignKey: 'order_id', as: 'order' });
RedemptionOrder.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
PointTransaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
    adminAdjustPoints,
    cancelOrderItem,
    getBalance,
    listAdminLedger,
    listItems,
    listLedger,
    listOrders,
    redeem,
    updateOrderItem,
    RewardItem,
};
