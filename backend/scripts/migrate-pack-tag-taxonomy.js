require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mariadb = require('mariadb');

async function main() {
    for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
        if (!process.env[name]) throw new Error(`${name} is required`);
    }

    const connection = await mariadb.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true,
    });

    try {
        const snapshotPackTags = async () => {
            const rows = await connection.query(`
                SELECT pack_id, tag_id
                FROM pack_tags
                ORDER BY pack_id ASC, tag_id ASC
            `);
            return rows.map(({ pack_id: packId, tag_id: tagId }) => `${packId}:${tagId}`);
        };
        const relationsBefore = await snapshotPackTags();
        const sqlPath = path.join(__dirname, '..', 'sql', '2026-08-17-pack-tag-taxonomy.sql');
        await connection.query(fs.readFileSync(sqlPath, 'utf8'));
        const rows = await connection.query(`
            SELECT COUNT(*) AS invalid_count
            FROM tag
            WHERE tag_key IS NULL OR tag_key = ''
               OR category NOT IN ('pattern', 'bpm', 'difficulty')
               OR name_zh IS NULL OR name_zh = ''
               OR name_en IS NULL OR name_en = ''
        `);
        if (Number(rows[0].invalid_count) !== 0) throw new Error('tag taxonomy verification failed');
        const relationsAfter = await snapshotPackTags();
        const relationsUnchanged = relationsBefore.length === relationsAfter.length
            && relationsBefore.every((relation, index) => relation === relationsAfter[index]);
        if (!relationsUnchanged) {
            throw new Error('pack_tags relation verification failed: existing pack tag bindings changed');
        }
        console.log(`Migration verified: taxonomy is ready and ${relationsAfter.length} pack tag bindings are unchanged.`);
    } finally {
        await connection.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
