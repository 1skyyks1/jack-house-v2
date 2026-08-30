require('dotenv').config();
const mariadb = require('mariadb');
const net = require('net');

async function hasColumn(connection, tableName, columnName) {
    const rows = await connection.query(
        `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tableName, columnName]
    );
    return Number(rows[0].count) > 0;
}

async function addColumn(connection, tableName, columnName, definition) {
    if (await hasColumn(connection, tableName, columnName)) return;
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
    console.log(`${tableName}.${columnName}: added`);
}

async function hasIndex(connection, tableName, indexName) {
    const rows = await connection.query(
        `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [tableName, indexName]
    );
    return Number(rows[0].count) > 0;
}

async function main() {
    for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
        if (!process.env[name]) throw new Error(`${name} is required`);
    }

    const connectionOptions = {
        connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 15000,
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
        await addColumn(connection, 'pack', 'leaderboard_enabled', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '启用站内Pack排行榜'");
        await addColumn(connection, 'pack', 'leaderboard_enabled_at', 'DATETIME NULL');
        await addColumn(connection, 'pack', 'leaderboard_enabled_by', 'INT NULL');
        if (!await hasIndex(connection, 'pack', 'idx_pack_leaderboard_enabled')) {
            await connection.query('CREATE INDEX `idx_pack_leaderboard_enabled` ON `pack` (`leaderboard_enabled`)');
            console.log('pack.idx_pack_leaderboard_enabled: added');
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS \`pack_score\` (
                \`id\` INT NOT NULL AUTO_INCREMENT,
                \`pack_id\` INT NOT NULL,
                \`beatmap_id\` INT NOT NULL,
                \`user_id\` INT NOT NULL,
                \`score\` INT NOT NULL,
                \`accuracy\` DECIMAL(12,10) NULL,
                \`max_combo\` INT UNSIGNED NULL,
                \`score_rank\` VARCHAR(2) NULL,
                \`statistics\` JSON NULL,
                \`mods\` JSON NULL,
                \`build_id\` BIGINT UNSIGNED NULL,
                \`osu_score_id\` BIGINT UNSIGNED NULL,
                \`played_at\` DATETIME NULL,
                \`created_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                UNIQUE KEY \`uq_pack_score_scope\` (\`user_id\`, \`pack_id\`, \`beatmap_id\`),
                KEY \`idx_pack_score_leaderboard\` (\`pack_id\`, \`beatmap_id\`, \`score\`),
                CONSTRAINT \`fk_pack_score_pack\` FOREIGN KEY (\`pack_id\`) REFERENCES \`pack\` (\`pack_id\`) ON DELETE CASCADE,
                CONSTRAINT \`fk_pack_score_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\` (\`user_id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `);
        console.log('Migration verified: independent Pack Rank storage is ready.');
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
