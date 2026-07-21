const fs = require('fs/promises');
const path = require('path');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

const SQL_PATH = path.resolve(__dirname, '..', 'sql', '2026-07-21-tournament-mappool-stats.sql');

const splitStatements = (sql) => sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

const main = async () => {
    try {
        await sequelize.authenticate();
        const sql = await fs.readFile(SQL_PATH, 'utf8');
        for (const statement of splitStatements(sql)) {
            await sequelize.query(statement);
        }

        const rows = await sequelize.query(
            `SELECT TABLE_NAME AS tableName
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 't_mappool_stats'`,
            { type: QueryTypes.SELECT },
        );
        if (rows.length !== 1) {
            throw new Error('Mappool stats migration verification failed.');
        }

        console.log('Mappool stats migration completed and verified: t_mappool_stats.');
    } finally {
        await sequelize.close();
    }
};

main().catch((error) => {
    console.error('Mappool stats migration failed:', error);
    process.exitCode = 1;
});
