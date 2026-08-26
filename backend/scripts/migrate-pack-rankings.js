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

async function hasIndex(connection, tableName, indexName) {
    const rows = await connection.query(
        `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [tableName, indexName]
    );
    return Number(rows[0].count) > 0;
}

async function addColumn(connection, tableName, columnName, definition) {
    if (await hasColumn(connection, tableName, columnName)) return;
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
    console.log(`${tableName}.${columnName}: added`);
}

async function migratePackRecommendation(connection) {
    await addColumn(connection, 'pack', 'is_recommended', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '管理员推荐' AFTER `cover_id`");
    await addColumn(connection, 'pack', 'recommended_at', 'DATETIME NULL AFTER `is_recommended`');
    await addColumn(connection, 'pack', 'recommended_by', 'INT NULL AFTER `recommended_at`');

    if (!await hasIndex(connection, 'pack', 'idx_pack_recommended')) {
        await connection.query('CREATE INDEX `idx_pack_recommended` ON `pack` (`is_recommended`, `recommended_at`)');
        console.log('pack.idx_pack_recommended: added');
    }
}

async function migrateEventScore(connection) {
    await addColumn(connection, 'event_score', 'beatmap_id', "INT NULL COMMENT 'osu beatmap ID' AFTER `stage_id`");
    await addColumn(connection, 'event_score', 'event_id', "INT NOT NULL DEFAULT 0 COMMENT '活动ID，0表示活动外成绩' AFTER `beatmap_id`");
    await addColumn(connection, 'event_score', 'osu_score_id', "BIGINT UNSIGNED NULL COMMENT 'osu成绩ID' AFTER `score`");
    await addColumn(connection, 'event_score', 'played_at', "DATETIME NULL COMMENT '游玩时间' AFTER `osu_score_id`");

    await connection.query(`
        UPDATE event_score es
        JOIN event_stage stage ON stage.id = es.stage_id
        SET es.beatmap_id = stage.map_id,
            es.event_id = stage.event_id,
            es.played_at = COALESCE(es.played_at, es.updated_time),
            es.updated_time = es.updated_time
        WHERE es.beatmap_id IS NULL OR es.event_id = 0
    `);

    // A previously run migration may already have triggered updated_time's ON UPDATE clause.
    // created_time is the remaining original EventScore timestamp for those legacy rows.
    await connection.query(`
        UPDATE event_score
        SET played_at = created_time,
            updated_time = created_time
        WHERE played_at IS NULL
    `);

    const unresolved = await connection.query(
        'SELECT COUNT(*) AS count FROM event_score WHERE beatmap_id IS NULL OR beatmap_id <= 0'
    );
    if (Number(unresolved[0].count) > 0) {
        throw new Error(`Cannot migrate ${unresolved[0].count} event_score rows without a beatmap ID`);
    }

    await connection.query(`
        DELETE older
        FROM event_score older
        JOIN event_score better
          ON better.user_id = older.user_id
         AND better.beatmap_id = older.beatmap_id
         AND better.event_id = older.event_id
         AND (
              better.score > older.score
              OR (better.score = older.score AND better.id < older.id)
         )
    `);

    const stageForeignKeys = await connection.query(`
        SELECT DISTINCT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'event_score'
          AND COLUMN_NAME = 'stage_id'
          AND REFERENCED_TABLE_NAME = 'event_stage'
    `);
    for (const row of stageForeignKeys) {
        await connection.query(`ALTER TABLE \`event_score\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
    }

    await connection.query('ALTER TABLE `event_score` MODIFY COLUMN `stage_id` INT NULL');
    await connection.query("ALTER TABLE `event_score` MODIFY COLUMN `beatmap_id` INT NOT NULL COMMENT 'osu beatmap ID'");
    await connection.query("ALTER TABLE `event_score` MODIFY COLUMN `event_id` INT NOT NULL DEFAULT 0 COMMENT '活动ID，0表示活动外成绩'");
    await connection.query(`
        UPDATE event_score es
        LEFT JOIN event_stage stage ON stage.id = es.stage_id
        SET es.stage_id = NULL
        WHERE es.stage_id IS NOT NULL AND stage.id IS NULL
    `);

    if (!await hasIndex(connection, 'event_score', 'uq_event_score_scope')) {
        await connection.query('CREATE UNIQUE INDEX `uq_event_score_scope` ON `event_score` (`user_id`, `beatmap_id`, `event_id`)');
    }
    if (!await hasIndex(connection, 'event_score', 'idx_event_score_beatmap_score')) {
        await connection.query('CREATE INDEX `idx_event_score_beatmap_score` ON `event_score` (`beatmap_id`, `score`)');
    }
    if (!await hasIndex(connection, 'event_score', 'idx_event_score_event_score')) {
        await connection.query('CREATE INDEX `idx_event_score_event_score` ON `event_score` (`event_id`, `score`)');
    }
    await connection.query(`
        ALTER TABLE \`event_score\`
        ADD CONSTRAINT \`fk_event_score_stage_persistent\`
        FOREIGN KEY (\`stage_id\`) REFERENCES \`event_stage\` (\`id\`) ON DELETE SET NULL
    `);
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
        await migratePackRecommendation(connection);
        await migrateEventScore(connection);
        console.log('Migration verified: Pack recommendations and persistent Beatmap rankings are ready.');
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
