require('dotenv').config();
const mariadb = require('mariadb');
const net = require('net');

async function hasColumn(connection, columnName) {
    const rows = await connection.query(
        `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pack' AND COLUMN_NAME = ?`,
        [columnName]
    );
    return Number(rows[0].count) > 0;
}

async function addColumn(connection, columnName, definition) {
    if (await hasColumn(connection, columnName)) return;
    await connection.query(`ALTER TABLE \`pack\` ADD COLUMN \`${columnName}\` ${definition}`);
    console.log(`pack.${columnName}: added`);
}

async function hasIndex(connection, indexName) {
    const rows = await connection.query(
        `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pack' AND INDEX_NAME = ?`,
        [indexName]
    );
    return Number(rows[0].count) > 0;
}

async function main() {
    for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
        if (!process.env[name]) throw new Error(`${name} is required`);
    }

    const connectionOptions = {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    };
    if (process.env.DB_LOCAL_ADDRESS) {
        connectionOptions.stream = () => net.connect({
            host: connectionOptions.host,
            port: connectionOptions.port,
            localAddress: process.env.DB_LOCAL_ADDRESS,
        });
    }

    const connection = await mariadb.createConnection(connectionOptions);
    try {
        await addColumn(connection, 'is_original', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '叠屋出品' AFTER `recommended_by`");
        await addColumn(connection, 'original_at', 'DATETIME NULL AFTER `is_original`');
        await addColumn(connection, 'original_by', 'INT NULL AFTER `original_at`');
        if (!await hasIndex(connection, 'idx_pack_original')) {
            await connection.query('CREATE INDEX `idx_pack_original` ON `pack` (`is_original`, `original_at`)');
            console.log('pack.idx_pack_original: added');
        }
        console.log('Migration verified: pack originals are ready.');
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
