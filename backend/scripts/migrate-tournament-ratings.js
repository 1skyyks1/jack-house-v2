const fs = require('fs/promises');
const path = require('path');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

const SQL_PATH = path.resolve(__dirname, '..', 'sql', '2026-07-27-tournament-ratings.sql');
const EXPECTED_TABLES = [
    't_tournament_rating_snapshot',
    't_tournament_player_rating',
    't_tournament_play_performance'
];

const splitStatements = (sql) => sql
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);

const main = async () => {
    try {
        await sequelize.authenticate();
        const sql = await fs.readFile(SQL_PATH, 'utf8');
        for (const statement of splitStatements(sql)) await sequelize.query(statement);

        const rows = await sequelize.query(
            `SELECT TABLE_NAME AS tableName
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN (:tables)`,
            { replacements: { tables: EXPECTED_TABLES }, type: QueryTypes.SELECT }
        );
        const found = new Set(rows.map(row => row.tableName));
        const missing = EXPECTED_TABLES.filter(table => !found.has(table));
        if (missing.length > 0) throw new Error(`Tournament ratings migration verification failed: ${missing.join(', ')}`);

        const gameColumns = await sequelize.query(
            `SELECT COLUMN_NAME AS columnName
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 't_game'
               AND COLUMN_NAME IN ('mp_game_id', 'played_at')`,
            { type: QueryTypes.SELECT }
        );
        const foundColumns = new Set(gameColumns.map(row => row.columnName));
        const missingColumns = ['mp_game_id', 'played_at'].filter(column => !foundColumns.has(column));
        if (missingColumns.length > 0) throw new Error(`Tournament ratings game-time migration verification failed: ${missingColumns.join(', ')}`);

        console.log(`Tournament ratings migration completed and verified: ${EXPECTED_TABLES.join(', ')}, t_game time columns.`);
    } finally {
        await sequelize.close();
    }
};

main().catch(error => {
    console.error('Tournament ratings migration failed:', error);
    process.exitCode = 1;
});
