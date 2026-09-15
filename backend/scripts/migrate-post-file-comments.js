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
        console.log('Starting migration: create post_file_comment table...');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS post_file_comment (
                comment_id INT NOT NULL AUTO_INCREMENT,
                file_id INT NOT NULL,
                user_id INT NOT NULL,
                comment TEXT NOT NULL,
                created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (comment_id),
                KEY idx_post_file_comment_file (file_id),
                KEY idx_post_file_comment_user (user_id),
                CONSTRAINT fk_post_file_comment_file FOREIGN KEY (file_id) REFERENCES post_file (file_id) ON DELETE CASCADE,
                CONSTRAINT fk_post_file_comment_user FOREIGN KEY (user_id) REFERENCES user (user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        const rows = await connection.query(
            `SELECT COUNT(*) AS count FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_file_comment'`
        );
        if (Number(rows[0].count) !== 1) throw new Error('post_file_comment table verification failed');
        console.log('Migration verified: post_file_comment is ready.');
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
