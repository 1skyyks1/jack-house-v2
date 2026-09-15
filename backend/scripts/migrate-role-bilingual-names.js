require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
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
        console.log('Starting migration: add bilingual name columns to role table...');

        // 检查并添加 name_zh
        const zhCols = await connection.query(`
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role' AND COLUMN_NAME = 'name_zh'
        `);
        if (zhCols.length === 0) {
            await connection.query('ALTER TABLE `role` ADD COLUMN `name_zh` VARCHAR(100) NULL AFTER `role_name`');
            console.log('Added name_zh column to role table.');
        }

        // 检查并添加 name_en
        const enCols = await connection.query(`
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role' AND COLUMN_NAME = 'name_en'
        `);
        if (enCols.length === 0) {
            await connection.query('ALTER TABLE `role` ADD COLUMN `name_en` VARCHAR(100) NULL AFTER `name_zh`');
            console.log('Added name_en column to role table.');
        }

        // 初始化回填已有角色的中英文
        await connection.query(`UPDATE \`role\` SET \`name_zh\` = '超级管理员', \`name_en\` = 'Administrator' WHERE \`role_code\` = 'admin' AND (\`name_zh\` IS NULL OR \`name_en\` IS NULL)`);
        await connection.query(`UPDATE \`role\` SET \`name_zh\` = '活动组织者', \`name_en\` = 'Organizer' WHERE \`role_code\` = 'organizer' AND (\`name_zh\` IS NULL OR \`name_en\` IS NULL)`);
        await connection.query(`UPDATE \`role\` SET \`name_zh\` = '投稿审核员', \`name_en\` = 'Reviewer' WHERE \`role_code\` = 'moderator' AND (\`name_zh\` IS NULL OR \`name_en\` IS NULL)`);
        await connection.query(`UPDATE \`role\` SET \`name_zh\` = '叠包主理人', \`name_en\` = 'Pack Curator' WHERE \`role_code\` = 'pack_reviewer' AND (\`name_zh\` IS NULL OR \`name_en\` IS NULL)`);

        await connection.query('UPDATE `role` SET `name_zh` = `role_name` WHERE `name_zh` IS NULL');
        await connection.query('UPDATE `role` SET `name_en` = `role_name` WHERE `name_en` IS NULL');

        console.log('Migration verified: bilingual name columns on role are ready.');
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
