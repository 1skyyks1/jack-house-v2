require('dotenv').config();
const mariadb = require('mariadb');

const migrations = {
    post_file: {
        columns: [
            ['storage_provider', "VARCHAR(32) NULL COMMENT '存储 provider' AFTER `file_url`"],
            ['object_key', "VARCHAR(255) NULL COMMENT '存储对象 key' AFTER `storage_provider`"],
            ['public_url', "VARCHAR(1024) NULL COMMENT '公开访问 URL' AFTER `object_key`"],
            ['download_url', "VARCHAR(1024) NULL COMMENT '下载 URL' AFTER `public_url`"],
            ['mime_type', "VARCHAR(255) NULL COMMENT 'MIME 类型' AFTER `download_url`"],
            ['checksum', "VARCHAR(64) NULL COMMENT 'SHA-256 文件校验值' AFTER `size`"],
        ],
        indexes: [
            ['idx_post_file_checksum', '(`checksum`)'],
        ],
        backfill: "UPDATE `post_file` SET `storage_provider` = COALESCE(`storage_provider`, 'minio'), `object_key` = COALESCE(`object_key`, `file_url`) WHERE `storage_provider` IS NULL OR `object_key` IS NULL",
    },
    home_img: {
        columns: [
            ['storage_provider', "VARCHAR(32) NULL COMMENT '存储 provider' AFTER `minio_img_name`"],
            ['object_key', "VARCHAR(255) NULL COMMENT '存储对象 key' AFTER `storage_provider`"],
            ['public_url', "VARCHAR(1024) NULL COMMENT '公开访问 URL' AFTER `object_key`"],
            ['download_url', "VARCHAR(1024) NULL COMMENT '下载 URL' AFTER `public_url`"],
            ['mime_type', "VARCHAR(255) NULL COMMENT 'MIME 类型' AFTER `download_url`"],
        ],
        indexes: [],
        backfill: "UPDATE `home_img` SET `storage_provider` = COALESCE(`storage_provider`, 'minio'), `object_key` = COALESCE(`object_key`, `minio_img_name`) WHERE `storage_provider` IS NULL OR `object_key` IS NULL",
    },
    badge: {
        columns: [
            ['storage_provider', "VARCHAR(32) NULL COMMENT 'storage provider' AFTER `minio_img_name`"],
            ['object_key', "VARCHAR(255) NULL COMMENT 'storage object key' AFTER `storage_provider`"],
            ['public_url', "VARCHAR(512) NULL COMMENT 'public url' AFTER `object_key`"],
            ['download_url', "VARCHAR(512) NULL COMMENT 'download url' AFTER `public_url`"],
            ['mime_type', "VARCHAR(128) NULL COMMENT 'mime type' AFTER `download_url`"],
            ['checksum', "VARCHAR(64) NULL COMMENT 'sha256 checksum' AFTER `mime_type`"],
        ],
        indexes: [],
        backfill: "UPDATE `badge` SET `storage_provider` = COALESCE(`storage_provider`, 'minio'), `object_key` = COALESCE(`object_key`, `minio_img_name`) WHERE `storage_provider` IS NULL OR `object_key` IS NULL",
    },
    event_stage: {
        columns: [
            ['storage_provider', "VARCHAR(32) NULL COMMENT 'storage provider' AFTER `minio_bg`"],
            ['object_key', "VARCHAR(255) NULL COMMENT 'storage object key' AFTER `storage_provider`"],
            ['public_url', "VARCHAR(512) NULL COMMENT 'public url' AFTER `object_key`"],
            ['download_url', "VARCHAR(512) NULL COMMENT 'download url' AFTER `public_url`"],
            ['mime_type', "VARCHAR(128) NULL COMMENT 'mime type' AFTER `download_url`"],
            ['checksum', "VARCHAR(64) NULL COMMENT 'sha256 checksum' AFTER `mime_type`"],
        ],
        indexes: [],
        backfill: "UPDATE `event_stage` SET `storage_provider` = COALESCE(`storage_provider`, 'minio'), `object_key` = COALESCE(`object_key`, `minio_bg`) WHERE `storage_provider` IS NULL OR `object_key` IS NULL",
    },
};

const requireEnv = (name) => {
    if (!process.env[name]) {
        throw new Error(`${name} is required`);
    }
};

const getColumns = async (conn, table) => {
    const rows = await conn.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [table]
    );
    return new Set(rows.map((row) => row.COLUMN_NAME));
};

const getIndexes = async (conn, table) => {
    const rows = await conn.query(
        'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [table]
    );
    return new Set(rows.map((row) => row.INDEX_NAME));
};

const migrateTable = async (conn, table, migration) => {
    const columns = await getColumns(conn, table);
    if (columns.size === 0) {
        throw new Error(`Table not found: ${table}`);
    }

    for (const [column, definition] of migration.columns) {
        if (columns.has(column)) {
            console.log(`${table}.${column}: exists`);
            continue;
        }

        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
        console.log(`${table}.${column}: added`);
        columns.add(column);
    }

    const indexes = await getIndexes(conn, table);
    for (const [indexName, definition] of migration.indexes) {
        if (indexes.has(indexName)) {
            console.log(`${table}.${indexName}: exists`);
            continue;
        }

        await conn.query(`CREATE INDEX \`${indexName}\` ON \`${table}\` ${definition}`);
        console.log(`${table}.${indexName}: added`);
    }

    const result = await conn.query(migration.backfill);
    console.log(`${table}: backfilled ${Number(result.affectedRows || 0)} rows`);
};

(async () => {
    for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
        requireEnv(name);
    }

    const conn = await mariadb.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: false,
    });

    try {
        for (const [table, migration] of Object.entries(migrations)) {
            await migrateTable(conn, table, migration);
        }
    } finally {
        await conn.end();
    }
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
