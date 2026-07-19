require('dotenv').config();

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const mariadb = require('mariadb');

const minio = require('../config/minio');
const storage = require('../services/storage');
const { hashFile } = require('../utils/imageOptimizer');

const STORAGE_SCOPE = 'EVENT_STAGE_BG';
const dryRun = process.env.EVENT_STAGE_BG_GITHUB_MIGRATION_DRY_RUN !== 'false';
const allowMissing = process.env.EVENT_STAGE_BG_GITHUB_MIGRATION_ALLOW_MISSING === 'true';

const requireEnv = (name) => {
    if (!process.env[name]) {
        throw new Error(`${name} is required`);
    }
};

const requireGitHubToken = () => {
    if (!process.env.EVENT_STAGE_BG_GITHUB_STORAGE_TOKEN && !process.env.GITHUB_STORAGE_TOKEN) {
        throw new Error('EVENT_STAGE_BG_GITHUB_STORAGE_TOKEN or GITHUB_STORAGE_TOKEN is required');
    }
};

const getLegacyBucket = () => process.env.MINIO_BG_BUCKET || 'mapbg';

const getGitHubBucket = () => storage.getBucketName(
    STORAGE_SCOPE,
    [],
    'event-stage-bg'
);

const getObjectName = (stage) => stage.object_key || stage.minio_bg;

const assertSafeObjectName = (objectName) => {
    const segments = String(objectName || '').split('/');
    if (!objectName || path.isAbsolute(objectName) || segments.includes('..')) {
        throw new Error(`Unsafe event stage background object name: ${objectName || '(empty)'}`);
    }
};

const inferMimeType = (objectName) => {
    switch (path.extname(objectName).toLowerCase()) {
        case '.gif':
            return 'image/gif';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.svg':
            return 'image/svg+xml';
        case '.webp':
            return 'image/webp';
        default:
            return 'application/octet-stream';
    }
};

const partitionBySourceAvailability = async (stages) => {
    const available = [];
    const missing = [];

    for (const stage of stages) {
        try {
            await minio.statObject(getLegacyBucket(), getObjectName(stage));
            available.push(stage);
        } catch (error) {
            if (error.code === 'NotFound' || error.code === 'NoSuchKey') {
                missing.push(stage);
                continue;
            }
            throw error;
        }
    }

    return { available, missing };
};

const migrateStage = async (conn, stage, tempDirectory) => {
    const sourceObjectName = getObjectName(stage);
    assertSafeObjectName(sourceObjectName);

    const filePath = path.join(tempDirectory, `${stage.id}-${path.basename(sourceObjectName)}`);

    try {
        await minio.fGetObject(getLegacyBucket(), sourceObjectName, filePath);

        const file = await fs.stat(filePath);
        const checksum = await hashFile(filePath);
        const mimeType = stage.mime_type || inferMimeType(sourceObjectName);
        const uploaded = await storage.uploadFile(STORAGE_SCOPE, {
            provider: 'github',
            bucket: getGitHubBucket(),
            objectName: sourceObjectName,
            filePath,
            mimeType,
            size: file.size,
        });

        await conn.beginTransaction();
        try {
            await conn.query(
                `UPDATE event_stage
                 SET minio_bg = ?,
                     storage_provider = ?,
                     object_key = ?,
                     public_url = ?,
                     download_url = ?,
                     mime_type = ?,
                     checksum = ?
                 WHERE id = ?`,
                [
                    uploaded.objectName,
                    uploaded.provider,
                    uploaded.objectKey,
                    uploaded.publicUrl,
                    uploaded.downloadUrl,
                    mimeType,
                    checksum,
                    stage.id,
                ]
            );
            await conn.commit();
        } catch (error) {
            await conn.rollback();
            throw error;
        }

        console.log(`stage ${stage.id} (event ${stage.event_id}, ${stage.title}): migrated to ${uploaded.objectKey}`);
    } finally {
        await fs.rm(filePath, { force: true });
    }
};

(async () => {
    ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].forEach(requireEnv);

    if (!dryRun) {
        ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'].forEach(requireEnv);
        requireGitHubToken();
    }

    const conn = await mariadb.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 15000,
        socketTimeout: Number(process.env.DB_SOCKET_TIMEOUT_MS) || 30000,
        multipleStatements: false,
    });
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'jack-house-event-stage-bg-'));

    try {
        const stages = await conn.query(
            `SELECT id, event_id, title, minio_bg, storage_provider, object_key, mime_type
             FROM event_stage
             WHERE COALESCE(storage_provider, 'minio') <> 'github'
             ORDER BY event_id, id`
        );

        if (stages.length === 0) {
            console.log('No legacy event stage background records require migration.');
            return;
        }

        if (dryRun) {
            stages.forEach((stage) => {
                console.log(`stage ${stage.id} (event ${stage.event_id}, ${stage.title}): ${getObjectName(stage)} -> GitHub/${getGitHubBucket()}`);
            });
            console.log(`Dry run: ${stages.length} event stage background(s) would be migrated. Set EVENT_STAGE_BG_GITHUB_MIGRATION_DRY_RUN=false to execute.`);
            return;
        }

        const { available, missing } = await partitionBySourceAvailability(stages);

        if (missing.length > 0) {
            missing.forEach((stage) => {
                console.error(`stage ${stage.id} (event ${stage.event_id}, ${stage.title}): source object missing: ${getObjectName(stage)}`);
            });

            if (!allowMissing) {
                throw new Error(
                    `${missing.length} source object(s) are missing from MinIO/${getLegacyBucket()}; no records were migrated. `
                    + 'Set EVENT_STAGE_BG_GITHUB_MIGRATION_ALLOW_MISSING=true to migrate the available records.'
                );
            }
        }

        for (const stage of available) {
            await migrateStage(conn, stage, tempDirectory);
        }

        console.log(`Migrated ${available.length} event stage background(s) to GitHub. Legacy MinIO objects were retained for rollback.`);
        if (missing.length > 0) {
            console.log(`Skipped ${missing.length} event stage background(s) because their MinIO source objects are missing.`);
        }
    } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true });
        await conn.end();
    }
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
