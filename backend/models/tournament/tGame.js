const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TGame = sequelize.define('TGame', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    mp_game_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: 'osu! multiplayer game id'
    },
    played_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'MP game 实际开始时间'
    },
    match_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    map_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '打的哪张图'
    },
    order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '第几局'
    },
    player1_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'team1上场选手'
    },
    player2_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'team2上场选手'
    },
    player1_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'team1选手分数'
    },
    player1_miss_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'team1选手实际 miss 数；NULL=未知'
    },
    player2_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'team2选手分数'
    },
    player2_miss_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'team2选手实际 miss 数；NULL=未知'
    },
    winner_team: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '1=红队胜 2=蓝队胜'
    },
    action_type: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '0=protect 1=ban 2=pick'
    },
    action_by: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '1=红队 2=蓝队'
    },
    created_time: {
        type: DataTypes.DATE,
        defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    }
}, {
    tableName: 't_game',
    timestamps: false
});

module.exports = TGame;
