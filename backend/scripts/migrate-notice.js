require('dotenv').config();
const mariadb = require('mariadb');

/**
 * 执行全站通知表（notice）的数据库迁移脚本
 */
async function main() {
    const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    for (const name of requiredEnv) {
        if (!process.env[name]) {
            throw new Error(`缺少环境变量: ${name}`);
        }
    }

    const connection = await mariadb.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        console.log(`正在连接数据库 ${process.env.DB_NAME} (${process.env.DB_HOST})...`);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS \`notice\` (
                \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                \`content_zh\` TEXT NOT NULL COMMENT '中文富文本通知内容',
                \`content_en\` TEXT NOT NULL COMMENT '英文富文本通知内容',
                \`is_active\` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用展示（1=启用，0=停用）',
                \`active_slot\` TINYINT(1) AS (CASE WHEN \`is_active\` = 1 THEN 1 ELSE NULL END) STORED COMMENT '保证同时只有一条启用通知',
                \`created_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                \`updated_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                UNIQUE KEY \`uq_notice_single_active\` (\`active_slot\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='全站重要通知表'
        `);

        // 兼容曾经允许多条通知同时启用的数据库：仅保留最新一条。
        await connection.query(`
            UPDATE \`notice\`
            SET \`is_active\` = 0
            WHERE \`is_active\` = 1
              AND \`id\` <> (
                  SELECT \`latest_id\`
                  FROM (SELECT MAX(\`id\`) AS \`latest_id\` FROM \`notice\` WHERE \`is_active\` = 1) AS \`latest\`
              )
        `);

        const activeSlotColumns = await connection.query(`
            SELECT COUNT(*) AS count
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'notice'
              AND COLUMN_NAME = 'active_slot'
        `);
        if (Number(activeSlotColumns[0].count) === 0) {
            await connection.query(`
                ALTER TABLE \`notice\`
                ADD COLUMN \`active_slot\` TINYINT(1)
                AS (CASE WHEN \`is_active\` = 1 THEN 1 ELSE NULL END) STORED
                COMMENT '保证同时只有一条启用通知'
            `);
        }

        const activeSlotIndexes = await connection.query(`
            SELECT COUNT(*) AS count
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'notice'
              AND INDEX_NAME = 'uq_notice_single_active'
        `);
        if (Number(activeSlotIndexes[0].count) === 0) {
            await connection.query(`
                ALTER TABLE \`notice\`
                ADD UNIQUE INDEX \`uq_notice_single_active\` (\`active_slot\`)
            `);
        }

        // 验证 notice 表是否存在
        const checkRows = await connection.query(
            `SELECT COUNT(*) AS count FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notice'`
        );

        if (Number(checkRows[0].count) !== 1) {
            throw new Error('notice 表创建校验失败');
        }

        // 查询表字段结构以供确认
        const columns = await connection.query(`DESCRIBE \`notice\``);
        console.log('notice 表迁移验证通过，字段信息如下：');
        console.table(columns);
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error('迁移失败:', error.message);
    process.exit(1);
});
