const fs = require('fs/promises');
const path = require('path');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

const SQL_PATH = path.resolve(__dirname, '..', 'sql', '2026-07-18-ai-image-jobs.sql');

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

        const tableRows = await sequelize.query(
            `SELECT TABLE_NAME AS tableName
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN ('ai_image_job', 'ai_image_runtime')
             ORDER BY TABLE_NAME`,
            { type: QueryTypes.SELECT },
        );
        const tableNames = new Set(
            tableRows.map((row) => row.tableName || row.TABLE_NAME),
        );
        const runtimeRows = await sequelize.query(
            'SELECT runtime_id FROM ai_image_runtime WHERE runtime_id = 1',
            { type: QueryTypes.SELECT },
        );

        if (
            !tableNames.has('ai_image_job')
            || !tableNames.has('ai_image_runtime')
            || runtimeRows.length !== 1
        ) {
            throw new Error('AI image job migration verification failed.');
        }

        console.log(
            'AI image job migration completed and verified: ai_image_job, ai_image_runtime, runtime guard 1.',
        );
    } finally {
        await sequelize.close();
    }
};

main().catch((error) => {
    console.error('AI image job migration failed:', error);
    process.exitCode = 1;
});
