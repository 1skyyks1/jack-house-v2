const fs = require('fs/promises');
const path = require('path');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

const SQL_PATH = path.resolve(__dirname, '..', 'sql', '2026-07-29-tournament-game-miss-count.sql');
const EXPECTED_COLUMNS = ['player1_miss_count', 'player2_miss_count'];

const splitStatements = sql => sql
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);

const main = async () => {
    try {
        await sequelize.authenticate();
        const sql = await fs.readFile(SQL_PATH, 'utf8');
        for (const statement of splitStatements(sql)) await sequelize.query(statement);

        const rows = await sequelize.query(
            `SELECT COLUMN_NAME AS columnName
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 't_game'
               AND COLUMN_NAME IN (:columns)`,
            { replacements: { columns: EXPECTED_COLUMNS }, type: QueryTypes.SELECT }
        );
        const found = new Set(rows.map(row => row.columnName));
        const missing = EXPECTED_COLUMNS.filter(column => !found.has(column));
        if (missing.length > 0) throw new Error(`Missing t_game columns: ${missing.join(', ')}`);

        console.log(`Tournament game miss-count migration completed: ${EXPECTED_COLUMNS.join(', ')}.`);
    } finally {
        await sequelize.close();
    }
};

main().catch(error => {
    console.error('Tournament game miss-count migration failed:', error);
    process.exitCode = 1;
});
