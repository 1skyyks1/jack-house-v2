const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TStaff = sequelize.define('TStaff', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    t_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '赛事id'
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户id'
    },
    role: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: 'host/pooler/custom_mapper/tester/referee/streamer/commentator'
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    }
}, {
    tableName: 't_staff',
    timestamps: false,
    indexes: [
        {
            unique: true,
            fields: ['t_id', 'user_id', 'role']
        }
    ]
});

module.exports = TStaff;
