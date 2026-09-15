const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const User = sequelize.define('User', {
    user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    user_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    password: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
            isEmail: true
        }
    },
    avatar: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    status: {
        type: DataTypes.INTEGER,
        defaultValue: 0,  // 默认为0（正常）
    },
    osu_uid: {
        type: DataTypes.INTEGER,
        unique: true,
        allowNull: true,
    },
    qq: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
    },
    discord: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
        onUpdate: DataTypes.NOW,
    },
}, {
    tableName: 'user',
    timestamps: true,
    createdAt: 'created_time',
    updatedAt: 'updated_time'
});

module.exports = User;
