const fs = require('node:fs/promises');
const path = require('node:path');
const sequelize = require('../config/db');
const { QueryTypes } = require('sequelize');

async function main() {
    try {
        const sql = await fs.readFile(path.join(__dirname, '../sql/2026-10-08-user-profile-client.sql'), 'utf8');
        await sequelize.query(sql, { logging: false });
        const columns = await sequelize.query(`SELECT COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'default_pp_client'`,
        { type: QueryTypes.SELECT, logging: false });
        if (columns.length !== 1 || columns[0].IS_NULLABLE !== 'NO') throw new Error('User profile client migration verification failed');
        console.log('User profile client migration verified. Existing records are retained.');
    } finally {
        await sequelize.close();
    }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
