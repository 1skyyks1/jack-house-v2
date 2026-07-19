require('dotenv').config();

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const mariadb = require('mariadb');

const minio = require('../config/minio');
const {
    getBadgesBucket,
    uploadBadgeFile,
} = require('../services/badgeStorage');
const { hashFile } = require('../utils/imageOptimizer');

const dryRun = process.env.BADGES_GITHUB_MIGRATION_DRY_RUN !== 'false';

const requireEnv = (name) => {
    if (!process.env[name]) {
        throw new Error(`${name} is required`);
    }
};

const requireGitHubToken = () => {
    if (!process.env.BADGES_GITHUB_STORAGE_TOKEN && !process.env.GITHUB_STORAGE_TOKEN) {
        throw new Error('BADGES_GITHUB_STORAGE_TOKEN or GITHUB_STORAGE_TOKEN is required');
    }
};

const getLegacyBucket = () => process.env.MINIO_BADGES_BUCKET || 'badges';

const getObjectName = (badge) => badge.object_key || badge.minio_img_name;

const assertSafeObjectName = (objectName) => {
    const segments = String(objectName || '').split('/');
    if (!objectName || path.isAbsolute(objectName) || segments.includes('..')) {
        throw new Error(`Unsafe badge object name: ${objectName || '(empty)'}`);
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

const migrateBadge = async (conn, badge, tempDirectory) => {
    const sourceObjectName = getObjectName(badge);
    assertSafeObjectName(sourceObjectName);

    const filePath = path.join(tempDirectory, `${badge.id}-${path.basename(sourceObjectName)}`);
    await minio.fGetObject(getLegacyBucket(), sourceObjectName, filePath);

    const file = await fs.stat(filePath);
    const checksum = await hashFile(filePath);
    const mimeType = badge.mime_type || inferMimeType(sourceObjectName);
    const uploaded = await uploadBadgeFile({
        objectName: sourceObjectName,
        filePath,
        mimeType,
        size: file.size,
    });

    await conn.beginTransaction();
    try {
        await conn.query(
            `UPDATE badge
             SET url = ?,
                 minio_img_name = ?,
                 storage_provider = ?,
                 object_key = ?,
                 public_url = ?,
                 download_url = ?,
                 mime_type = ?,
                 checksum = ?
             WHERE id = ?`,
            [
                uploaded.url,
                uploaded.objectName,
                uploaded.provider,
                uploaded.objectKey,
                uploaded.publicUrl,
                uploaded.downloadUrl,
                mimeType,
                checksum,
                badge.id,
            ]
        );
        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        await fs.rm(filePath, { force: true });
    }

    console.log(`badge ${badge.id} (${badge.name}): migrated to ${uploaded.objectKey}`);
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
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'jack-house-badges-'));

    try {
        const badges = await conn.query(
            `SELECT id, name, minio_img_name, storage_provider, object_key, mime_type
             FROM badge
             WHERE COALESCE(storage_provider, 'minio') <> 'github'
             ORDER BY id`
        );

        if (badges.length === 0) {
            console.log('No legacy badge records require migration.');
            return;
        }

        if (dryRun) {
            badges.forEach((badge) => {
                console.log(`badge ${badge.id} (${badge.name}): ${getObjectName(badge)} -> GitHub/${getBadgesBucket()}`);
            });
            console.log(`Dry run: ${badges.length} badge(s) would be migrated. Set BADGES_GITHUB_MIGRATION_DRY_RUN=false to execute.`);
            return;
        }

        for (const badge of badges) {
            await migrateBadge(conn, badge, tempDirectory);
        }

        console.log(`Migrated ${badges.length} badge(s) to GitHub. Legacy MinIO objects were retained for rollback.`);
    } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true });
        await conn.end();
    }
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
