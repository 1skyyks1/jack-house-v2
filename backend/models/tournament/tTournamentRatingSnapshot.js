const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TTournamentRatingSnapshot = sequelize.define('TTournamentRatingSnapshot', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    t_id: { type: DataTypes.INTEGER, allowNull: false },
    model_version: { type: DataTypes.STRING(32), allowNull: false },
    parameters_json: { type: DataTypes.TEXT('long'), allowNull: false },
    source_hash: { type: DataTypes.STRING(64), allowNull: false },
    game_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    player_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    calculated_by: { type: DataTypes.INTEGER, allowNull: true },
    calculated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    is_final: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    finalized_by: { type: DataTypes.INTEGER, allowNull: true },
    finalized_at: { type: DataTypes.DATE, allowNull: true }
}, {
    tableName: 't_tournament_rating_snapshot',
    timestamps: false,
    indexes: [
        { unique: true, fields: ['t_id'] },
        { fields: ['calculated_at'] }
    ]
});

module.exports = TTournamentRatingSnapshot;
