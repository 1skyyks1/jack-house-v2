require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const mariadb = require('mariadb');

const requireEnv = (name) => {
    if (!process.env[name]) {
        throw new Error(`${name} is required`);
    }
};

(async () => {
    for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
        requireEnv(name);
    }

    const sql = await fs.readFile(path.join(__dirname, '../sql/2026-06-29-rich-text-assets.sql'), 'utf8');
    const conn = await mariadb.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true,
    });

    try {
        await conn.query(sql);
        console.log('rich_text_asset tables: ready');
    } finally {
        await conn.end();
    }
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
