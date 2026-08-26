require('dotenv').config();
const mariadb = require('mariadb');
const net = require('net');

async function hasColumn(connection, columnName) {
    const rows = await connection.query(
        `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_score' AND COLUMN_NAME = ?`,
        [columnName]
    );
    return Number(rows[0].count) > 0;
}

async function addColumn(connection, columnName, definition) {
    if (await hasColumn(connection, columnName)) return;
    await connection.query(`ALTER TABLE \`event_score\` ADD COLUMN \`${columnName}\` ${definition}`);
    console.log(`event_score.${columnName}: added`);
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
        await addColumn(connection, 'accuracy', "DECIMAL(12,10) NULL COMMENT '准确率（0-1）' AFTER `score`");
        await addColumn(connection, 'max_combo', "INT UNSIGNED NULL COMMENT '最大连击' AFTER `accuracy`");
        await addColumn(connection, 'score_rank', "VARCHAR(2) NULL COMMENT 'osu成绩评级' AFTER `max_combo`");
        await addColumn(connection, 'statistics', "JSON NULL COMMENT 'osu判定统计' AFTER `score_rank`");
        await addColumn(connection, 'mods', "JSON NULL COMMENT 'osu成绩Mods' AFTER `statistics`");
        await addColumn(connection, 'build_id', "BIGINT UNSIGNED NULL COMMENT 'osu lazer客户端build ID，空表示stable' AFTER `mods`");
        console.log('Migration verified: event score details are ready.');
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
