const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TTournamentPlayPerformance = sequelize.define('TTournamentPlayPerformance', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    snapshot_id: { type: DataTypes.INTEGER, allowNull: false },
    t_id: { type: DataTypes.INTEGER, allowNull: false },
    game_id: { type: DataTypes.INTEGER, allowNull: false },
    match_id: { type: DataTypes.INTEGER, allowNull: false },
    map_id: { type: DataTypes.INTEGER, allowNull: false },
    player_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    opponent_player_id: { type: DataTypes.INTEGER, allowNull: false },
    opponent_user_id: { type: DataTypes.INTEGER, allowNull: false },
    side: { type: DataTypes.TINYINT, allowNull: false },
    sequence_no: { type: DataTypes.INTEGER, allowNull: false },
    score: { type: DataTypes.INTEGER, allowNull: false },
    opponent_score: { type: DataTypes.INTEGER, allowNull: false },
    won: { type: DataTypes.TINYINT, allowNull: false },
    jpp: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    absolute_component: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    match_component: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    absolute_weight: { type: DataTypes.DECIMAL(8, 6), allowNull: false },
    rating_before: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    rating_delta: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    rating_after: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    reliability: { type: DataTypes.STRING(16), allowNull: false }
}, {
    tableName: 't_tournament_play_performance',
    timestamps: false,
    indexes: [
        { unique: true, fields: ['snapshot_id', 'game_id', 'player_id'] },
        { fields: ['snapshot_id', 'player_id', 'sequence_no'] },
        { fields: ['game_id'] }
    ]
});

module.exports = TTournamentPlayPerformance;
