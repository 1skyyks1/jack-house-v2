const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const PointAccount = sequelize.define('PointAccount', {
    user_id: { type: DataTypes.INTEGER, primaryKey: true },
    balance: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
}, {
    tableName: 'point_account',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
});

const PointTransaction = sequelize.define('PointTransaction', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.BIGINT, allowNull: false },
    balance_after: { type: DataTypes.BIGINT, allowNull: false },
    type: { type: DataTypes.STRING(32), allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: false },
    order_id: { type: DataTypes.BIGINT, allowNull: true },
    operator_id: { type: DataTypes.INTEGER, allowNull: true },
}, {
    tableName: 'point_transaction',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: false,
});

const RewardItem = sequelize.define('RewardItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    name_zh: { type: DataTypes.STRING(120), allowNull: true },
    name_en: { type: DataTypes.STRING(120), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    description_zh: { type: DataTypes.TEXT, allowNull: true },
    description_en: { type: DataTypes.TEXT, allowNull: true },
    image_url: { type: DataTypes.STRING(1024), allowNull: true },
    type: { type: DataTypes.ENUM('virtual', 'physical'), allowNull: false },
    point_cost: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    stock: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    limit_per_user: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    status: { type: DataTypes.ENUM('draft', 'active', 'inactive'), allowNull: false, defaultValue: 'draft' },
    starts_at: { type: DataTypes.DATE, allowNull: true },
    ends_at: { type: DataTypes.DATE, allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    id_label: { type: DataTypes.STRING(80), allowNull: true },
    id_label_zh: { type: DataTypes.STRING(80), allowNull: true },
    id_label_en: { type: DataTypes.STRING(80), allowNull: true },
    id_placeholder: { type: DataTypes.STRING(160), allowNull: true },
    id_placeholder_zh: { type: DataTypes.STRING(160), allowNull: true },
    id_placeholder_en: { type: DataTypes.STRING(160), allowNull: true },
}, {
    tableName: 'reward_item',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
});

const RedemptionOrder = sequelize.define('RedemptionOrder', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    order_no: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    total_points: { type: DataTypes.BIGINT, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'processing', 'completed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
    recipient: { type: DataTypes.STRING(80), allowNull: true },
    contact: { type: DataTypes.STRING(40), allowNull: true },
    address: { type: DataTypes.STRING(500), allowNull: true },
    shipping_remark: { type: DataTypes.STRING(500), allowNull: true },
}, {
    tableName: 'redemption_order',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
});

const RedemptionOrderItem = sequelize.define('RedemptionOrderItem', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    order_id: { type: DataTypes.BIGINT, allowNull: false },
    reward_item_id: { type: DataTypes.INTEGER, allowNull: false },
    item_name: { type: DataTypes.STRING(120), allowNull: false },
    item_name_zh: { type: DataTypes.STRING(120), allowNull: true },
    item_name_en: { type: DataTypes.STRING(120), allowNull: true },
    item_type: { type: DataTypes.ENUM('virtual', 'physical'), allowNull: false },
    image_url: { type: DataTypes.STRING(1024), allowNull: true },
    unit_points: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    subtotal_points: { type: DataTypes.BIGINT, allowNull: false },
    virtual_id: { type: DataTypes.STRING(160), allowNull: true },
    remark: { type: DataTypes.STRING(500), allowNull: true },
    fulfillment_status: { type: DataTypes.ENUM('pending', 'processing', 'completed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
    fulfillment_detail: { type: DataTypes.STRING(500), allowNull: true },
}, {
    tableName: 'redemption_order_item',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time',
});

module.exports = {
    PointAccount,
    PointTransaction,
    RewardItem,
    RedemptionOrder,
    RedemptionOrderItem,
};
