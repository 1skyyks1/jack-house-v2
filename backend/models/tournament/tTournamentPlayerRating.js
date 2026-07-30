const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TTournamentPlayerRating = sequelize.define('TTournamentPlayerRating', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    snapshot_id: { type: DataTypes.INTEGER, allowNull: false },
    t_id: { type: DataTypes.INTEGER, allowNull: false },
    player_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    team_id: { type: DataTypes.INTEGER, allowNull: true },
    tournament_rating: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    rating_delta: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    average_jpp: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    best_jpp: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    game_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    win_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    reliability: { type: DataTypes.STRING(16), allowNull: false }
}, {
    tableName: 't_tournament_player_rating',
    timestamps: false,
    indexes: [
        { unique: true, fields: ['snapshot_id', 'player_id'] },
        { fields: ['snapshot_id', 'tournament_rating'] },
        { fields: ['user_id', 't_id'] }
    ]
});

module.exports = TTournamentPlayerRating;
