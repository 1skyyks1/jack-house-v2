const fs = require('fs/promises');
const path = require('path');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

const SQL_PATHS = [
    path.resolve(__dirname, '..', 'sql', '2026-08-17-rewards.sql'),
    path.resolve(__dirname, '..', 'sql', '2026-08-17-rewards-i18n.sql'),
];

async function main() {
    try {
        await sequelize.authenticate();
        for (const sqlPath of SQL_PATHS) {
            const sql = await fs.readFile(sqlPath, 'utf8');
            for (const statement of sql.split(';').map((value) => value.trim()).filter(Boolean)) {
                await sequelize.query(statement);
            }
        }
        const rows = await sequelize.query(
            `SELECT TABLE_NAME AS tableName FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN
             ('point_account', 'point_transaction', 'reward_item', 'redemption_order', 'redemption_order_item')`,
            { type: QueryTypes.SELECT },
        );
        if (rows.length !== 5) throw new Error('Rewards migration verification failed');
        const columns = await sequelize.query(
            `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND
             ((TABLE_NAME = 'reward_item' AND COLUMN_NAME IN
             ('name_zh', 'name_en', 'description_zh', 'description_en', 'id_label_zh', 'id_label_en', 'id_placeholder_zh', 'id_placeholder_en')) OR
             (TABLE_NAME = 'redemption_order_item' AND COLUMN_NAME IN ('item_name_zh', 'item_name_en')))`,
            { type: QueryTypes.SELECT },
        );
        if (columns.length !== 10) throw new Error('Rewards i18n migration verification failed');
        console.log('Rewards migration completed and verified.');
    } finally {
        await sequelize.close();
    }
}

main().catch((error) => {
    console.error('Rewards migration failed:', error);
    process.exitCode = 1;
});
