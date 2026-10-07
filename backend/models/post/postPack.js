const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

module.exports = sequelize.define('PostPack', {
    post_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    pack_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
}, {
    tableName: 'post_pack',
    timestamps: false,
    indexes: [{ name: 'idx_post_pack_pack', fields: ['pack_id', 'post_id'] }],
});
