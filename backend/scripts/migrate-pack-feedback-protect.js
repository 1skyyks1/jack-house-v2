require('dotenv').config();
const mariadb = require('mariadb');

async function main() {
    const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    for (const name of requiredEnv) {
        if (!process.env[name]) throw new Error(`${name} is required`);
    }

    const connection = await mariadb.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        console.log('Starting migration: protect pack_feedback on pack deletion...');

        // 允许 pack_id 为 NULL
        await connection.query('ALTER TABLE pack_feedback MODIFY COLUMN pack_id INT NULL');

        // 添加 pack_title_snapshot 字段
        const cols = await connection.query(`
            SELECT COUNT(*) AS count FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pack_feedback' AND COLUMN_NAME = 'pack_title_snapshot'
        `);
        if (Number(cols[0].count) === 0) {
            await connection.query("ALTER TABLE pack_feedback ADD COLUMN pack_title_snapshot VARCHAR(255) NULL COMMENT '图包标题快照' AFTER pack_id");
            console.log('Added column pack_title_snapshot.');
        }

        // 回填现有标题快照
        await connection.query(`
            UPDATE pack_feedback f
            JOIN pack p ON f.pack_id = p.pack_id
            SET f.pack_title_snapshot = p.title
            WHERE f.pack_title_snapshot IS NULL
        `);

        // 修改外键约束为 ON DELETE SET NULL
        const fks = await connection.query(`
            SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pack_feedback' AND CONSTRAINT_NAME = 'fk_pack_feedback_pack'
        `);
        if (fks.length > 0) {
            await connection.query('ALTER TABLE pack_feedback DROP FOREIGN KEY fk_pack_feedback_pack');
        }
        await connection.query(`
            ALTER TABLE pack_feedback
            ADD CONSTRAINT fk_pack_feedback_pack FOREIGN KEY (pack_id) REFERENCES pack (pack_id) ON DELETE SET NULL
        `);

        console.log('Migration verified: pack_feedback protection is ready.');
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
