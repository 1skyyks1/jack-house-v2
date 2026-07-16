require('dotenv').config();
const mariadb = require('mariadb');

const TABLE_NAME = 'pack_map';
const COLUMN_NAME = 'beatmap_id';
const INDEX_NAME = 'idx_pack_map_beatmap_id';

function requireEnv(name) {
    if (!process.env[name]) throw new Error(`${name} is required`);
}

async function getSchemaState(connection) {
    const columns = await connection.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [TABLE_NAME]
    );
    if (columns.length === 0) throw new Error(`Table not found: ${TABLE_NAME}`);

    const indexes = await connection.query(
        `SELECT DISTINCT INDEX_NAME
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [TABLE_NAME]
    );

    return {
        hasColumn: columns.some((row) => row.COLUMN_NAME === COLUMN_NAME),
        hasIndex: indexes.some((row) => row.INDEX_NAME === INDEX_NAME),
    };
}

async function getExistingDataSignature(connection) {
    const rows = await connection.query(
        `SELECT
            COUNT(*) AS row_count,
            COALESCE(SUM(map_id), 0) AS map_id_sum,
            COALESCE(BIT_XOR(CRC32(CONCAT_WS(CHAR(31),
                COALESCE(CAST(map_id AS CHAR), '<NULL>'),
                COALESCE(CAST(pack_id AS CHAR), '<NULL>'),
                COALESCE(CAST(rating AS CHAR), '<NULL>'),
                COALESCE(CAST(length AS CHAR), '<NULL>'),
                COALESCE(CAST(real_length AS CHAR), '<NULL>'),
                COALESCE(version, '<NULL>'),
                COALESCE(CAST(od AS CHAR), '<NULL>'),
                COALESCE(CAST(hp AS CHAR), '<NULL>'),
                COALESCE(CAST(bpm AS CHAR), '<NULL>'),
                COALESCE(CAST(key_count AS CHAR), '<NULL>'),
                COALESCE(CAST(ln_count AS CHAR), '<NULL>'),
                COALESCE(CAST(created_time AS CHAR), '<NULL>'),
                COALESCE(CAST(updated_time AS CHAR), '<NULL>')
            ))), 0) AS data_signature
         FROM pack_map`
    );
    const row = rows[0];
    return {
        dataSignature: String(row.data_signature),
        mapIdSum: String(row.map_id_sum),
        rowCount: Number(row.row_count),
    };
}

function signaturesMatch(before, after) {
    return before.rowCount === after.rowCount
        && before.mapIdSum === after.mapIdSum
        && before.dataSignature === after.dataSignature;
}

async function main() {
    for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) requireEnv(name);

    const connection = await mariadb.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: false,
    });

    try {
        const checkOnly = process.argv.includes('--check');
        const schemaBefore = await getSchemaState(connection);
        const dataBefore = await getExistingDataSignature(connection);
        console.log(`pack_map: ${dataBefore.rowCount} rows; column=${schemaBefore.hasColumn ? 'present' : 'missing'}; index=${schemaBefore.hasIndex ? 'present' : 'missing'}`);

        if (checkOnly) return;

        if (!schemaBefore.hasColumn) {
            await connection.query(
                "ALTER TABLE `pack_map` ADD COLUMN `beatmap_id` INT NULL COMMENT 'osu beatmap_id' AFTER `map_id`"
            );
            console.log('pack_map.beatmap_id: added');
        }

        const schemaAfterColumn = await getSchemaState(connection);
        if (!schemaAfterColumn.hasIndex) {
            await connection.query('CREATE INDEX `idx_pack_map_beatmap_id` ON `pack_map` (`beatmap_id`)');
            console.log('pack_map.idx_pack_map_beatmap_id: added');
        }

        const schemaAfter = await getSchemaState(connection);
        const dataAfter = await getExistingDataSignature(connection);
        if (!schemaAfter.hasColumn || !schemaAfter.hasIndex) {
            throw new Error('Schema verification failed after migration');
        }
        if (!signaturesMatch(dataBefore, dataAfter)) {
            throw new Error('Existing pack_map data changed unexpectedly; verification failed');
        }

        if (!schemaBefore.hasColumn) {
            const populatedRows = await connection.query(
                'SELECT COUNT(*) AS count FROM `pack_map` WHERE `beatmap_id` IS NOT NULL'
            );
            if (Number(populatedRows[0].count) !== 0) {
                throw new Error('New beatmap_id column did not initialize existing rows as NULL');
            }
        }

        console.log(`Migration verified: ${dataAfter.rowCount} existing rows preserved.`);
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
