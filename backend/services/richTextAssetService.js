const { Op } = require('sequelize');
const { RichTextAsset, RichTextAssetReference } = require('../models');
const storage = require('./storage');

const STATUS_UPLOADED = 'uploaded';
const STATUS_REFERENCED = 'referenced';
const STATUS_ORPHANED = 'orphaned';
const RICHTEXT_STORAGE_SCOPE = 'RICHTEXT';
const DEFAULT_GITHUB_STORAGE_OWNER = '1skyyks1';
const DEFAULT_GITHUB_STORAGE_REPO = 'jack-house-img';

const decodeHtmlAttribute = (value) => {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
};

const extractImageSources = (html = '') => {
    if (!html || typeof html !== 'string') {
        return [];
    }

    const sources = new Set();
    const imgSrcPattern = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
    let match;

    while ((match = imgSrcPattern.exec(html)) !== null) {
        const source = decodeHtmlAttribute(match[1] || match[2] || match[3] || '').trim();
        if (source) {
            sources.add(source);
        }
    }

    return [...sources];
};

const now = () => new Date();

const toPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const trimSlashes = (value = '') => value.replace(/^\/+|\/+$/g, '');

const getRichTextBucket = () => storage.getBucketName(
    RICHTEXT_STORAGE_SCOPE,
    ['MINIO_RICHTEXT_BUCKET', 'MINIO_HOMEIMG_BUCKET'],
    storage.getProviderName(RICHTEXT_STORAGE_SCOPE) === 'github' ? 'rich-text' : null
);

const getManagedGithubRepo = () => ({
    owner: (process.env.RICHTEXT_GITHUB_STORAGE_OWNER || process.env.GITHUB_STORAGE_OWNER || DEFAULT_GITHUB_STORAGE_OWNER).toLowerCase(),
    repo: (process.env.RICHTEXT_GITHUB_STORAGE_REPO || process.env.GITHUB_STORAGE_REPO || DEFAULT_GITHUB_STORAGE_REPO).toLowerCase(),
});

const normalizeUrl = (source) => {
    try {
        return new URL(source, process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_URL || 'http://localhost');
    } catch (error) {
        return null;
    }
};

const decodePathParts = (pathname) => pathname
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));

const resolveManagedRichTextSource = (source) => {
    const url = normalizeUrl(source);
    if (!url) {
        return null;
    }

    const { owner, repo } = getManagedGithubRepo();
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'cdn.jsdelivr.net') {
        const parts = decodePathParts(url.pathname);
        if (parts[0] !== 'gh' || parts.length < 4) {
            return null;
        }

        const sourceOwner = (parts[1] || '').toLowerCase();
        const sourceRepo = (parts[2] || '').split('@')[0].toLowerCase();
        if (sourceOwner !== owner || sourceRepo !== repo) {
            return null;
        }

        return {
            storage_provider: 'github',
            object_key: trimSlashes(parts.slice(3).join('/')),
            public_url: source,
            download_url: source,
        };
    }

    if (hostname === 'raw.githubusercontent.com') {
        const parts = decodePathParts(url.pathname);
        if (parts.length < 4) {
            return null;
        }

        const sourceOwner = (parts[0] || '').toLowerCase();
        const sourceRepo = (parts[1] || '').toLowerCase();
        if (sourceOwner !== owner || sourceRepo !== repo) {
            return null;
        }

        return {
            storage_provider: 'github',
            object_key: trimSlashes(parts.slice(3).join('/')),
            public_url: source,
            download_url: source,
        };
    }

    const richTextProxyMatch = url.pathname.match(/\/upload\/rich-text\/image\/([^/]+)$/);
    if (richTextProxyMatch) {
        const objectName = decodeURIComponent(richTextProxyMatch[1]);
        return {
            storage_provider: 'minio',
            object_key: objectName,
            public_url: source,
            download_url: source,
        };
    }

    return null;
};

const getManagedSources = (sources) => sources
    .map((source) => ({ source, managed: resolveManagedRichTextSource(source) }))
    .filter(({ managed }) => managed?.object_key);

const recordUploadedRichTextAsset = async ({
    user_id,
    storage_provider,
    object_key,
    public_url,
    download_url,
    mime_type,
    size,
    checksum,
}) => {
    const timestamp = now();
    const existing = await RichTextAsset.findOne({ where: { object_key } });

    if (existing) {
        existing.user_id = user_id || existing.user_id;
        existing.storage_provider = storage_provider;
        existing.public_url = public_url || existing.public_url;
        existing.download_url = download_url || existing.download_url;
        existing.mime_type = mime_type || existing.mime_type;
        existing.size = size ?? existing.size;
        existing.checksum = checksum || existing.checksum;
        existing.updated_time = timestamp;
        await existing.save();
        return existing;
    }

    return RichTextAsset.create({
        user_id,
        storage_provider,
        object_key,
        public_url,
        download_url,
        mime_type,
        size,
        checksum,
        status: STATUS_UPLOADED,
        created_time: timestamp,
        updated_time: timestamp,
    });
};

const ensureManagedAssetsForSources = async (sources, { transaction, dryRun = false } = {}) => {
    const managedSources = getManagedSources(sources);
    const results = {
        created: 0,
        matched: 0,
        skipped: sources.length - managedSources.length,
        sources: managedSources,
    };

    if (dryRun) {
        for (const { managed } of managedSources) {
            const existing = await RichTextAsset.findOne({
                where: { object_key: managed.object_key },
                transaction,
            });
            if (existing) {
                results.matched += 1;
            } else {
                results.created += 1;
            }
        }
        return results;
    }

    const timestamp = now();
    for (const { managed } of managedSources) {
        const existing = await RichTextAsset.findOne({
            where: { object_key: managed.object_key },
            transaction,
        });

        if (existing) {
            const patch = { updated_time: timestamp };
            if (!existing.public_url) patch.public_url = managed.public_url;
            if (!existing.download_url) patch.download_url = managed.download_url;
            if (existing.storage_provider !== managed.storage_provider) patch.storage_provider = managed.storage_provider;
            await existing.update(patch, { transaction });
            results.matched += 1;
            continue;
        }

        await RichTextAsset.create({
            storage_provider: managed.storage_provider,
            object_key: managed.object_key,
            public_url: managed.public_url,
            download_url: managed.download_url,
            status: STATUS_UPLOADED,
            created_time: timestamp,
            updated_time: timestamp,
        }, { transaction });
        results.created += 1;
    }

    return results;
};

const findAssetsBySources = async (sources, transaction) => {
    if (!sources.length) {
        return [];
    }

    const managedObjectKeys = getManagedSources(sources).map(({ managed }) => managed.object_key);
    return RichTextAsset.findAll({
        where: {
            [Op.or]: [
                { public_url: { [Op.in]: sources } },
                { download_url: { [Op.in]: sources } },
                ...(managedObjectKeys.length ? [{ object_key: { [Op.in]: managedObjectKeys } }] : []),
            ],
        },
        transaction,
    });
};

const findSourceForAsset = (asset, sources) => {
    return sources.find((source) => source === asset.public_url || source === asset.download_url) || asset.public_url || asset.download_url;
};

const refreshAssetStatuses = async (assetIds, transaction) => {
    const uniqueIds = [...new Set(assetIds.filter(Boolean))];
    const timestamp = now();

    for (const assetId of uniqueIds) {
        const referenceCount = await RichTextAssetReference.count({
            where: { rich_text_asset_id: assetId },
            transaction,
        });

        await RichTextAsset.update({
            status: referenceCount > 0 ? STATUS_REFERENCED : STATUS_ORPHANED,
            orphaned_time: referenceCount > 0 ? null : timestamp,
            updated_time: timestamp,
        }, {
            where: { rich_text_asset_id: assetId },
            transaction,
        });
    }
};

const syncRichTextAssetReferences = async ({ contentType, contentId, html, transaction, createMissingAssets = false, dryRun = false }) => {
    if (!contentType || !contentId) {
        return { referenced: 0, orphaned: 0, assetsCreated: 0, assetsMatched: 0, sourcesSkipped: 0 };
    }

    const sources = extractImageSources(html);
    const assetResults = createMissingAssets
        ? await ensureManagedAssetsForSources(sources, { transaction, dryRun })
        : { created: 0, matched: 0, skipped: 0 };
    if (dryRun) {
        const assets = await findAssetsBySources(sources, transaction);
        return {
            referenced: assets.length,
            orphaned: 0,
            assetsCreated: assetResults.created,
            assetsMatched: assetResults.matched,
            sourcesSkipped: assetResults.skipped,
        };
    }

    const timestamp = now();
    const existingRefs = await RichTextAssetReference.findAll({
        where: {
            content_type: contentType,
            content_id: contentId,
        },
        transaction,
    });
    const existingAssetIds = existingRefs.map((ref) => ref.rich_text_asset_id);
    const assets = await findAssetsBySources(sources, transaction);
    const currentAssetIds = assets.map((asset) => asset.rich_text_asset_id);
    const currentAssetIdSet = new Set(currentAssetIds);
    const existingAssetIdSet = new Set(existingAssetIds);

    for (const asset of assets) {
        if (existingAssetIdSet.has(asset.rich_text_asset_id)) {
            await RichTextAssetReference.update({
                source_url: findSourceForAsset(asset, sources),
                updated_time: timestamp,
            }, {
                where: {
                    rich_text_asset_id: asset.rich_text_asset_id,
                    content_type: contentType,
                    content_id: contentId,
                },
                transaction,
            });
            continue;
        }

        await RichTextAssetReference.create({
            rich_text_asset_id: asset.rich_text_asset_id,
            content_type: contentType,
            content_id: contentId,
            source_url: findSourceForAsset(asset, sources),
            created_time: timestamp,
            updated_time: timestamp,
        }, { transaction });
    }

    const refsToRemove = existingRefs.filter((ref) => !currentAssetIdSet.has(ref.rich_text_asset_id));
    if (refsToRemove.length) {
        await RichTextAssetReference.destroy({
            where: {
                rich_text_asset_reference_id: {
                    [Op.in]: refsToRemove.map((ref) => ref.rich_text_asset_reference_id),
                },
            },
            transaction,
        });
    }

    await refreshAssetStatuses([...existingAssetIds, ...currentAssetIds], transaction);

    return {
        referenced: currentAssetIds.length,
        orphaned: refsToRemove.length,
        assetsCreated: assetResults.created,
        assetsMatched: assetResults.matched,
        sourcesSkipped: assetResults.skipped,
    };
};

const findCleanupCandidates = async ({ retentionDays, limit }) => {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    return RichTextAsset.findAll({
        where: {
            [Op.or]: [
                {
                    status: STATUS_ORPHANED,
                    orphaned_time: { [Op.lte]: cutoff },
                },
                {
                    status: STATUS_UPLOADED,
                    created_time: { [Op.lte]: cutoff },
                },
            ],
        },
        order: [['updated_time', 'ASC']],
        limit,
    });
};

const cleanupRichTextAssets = async ({
    retentionDays = toPositiveInt(process.env.RICHTEXT_ASSET_CLEANUP_RETENTION_DAYS, 7),
    limit = toPositiveInt(process.env.RICHTEXT_ASSET_CLEANUP_LIMIT, 100),
    dryRun = process.env.RICHTEXT_ASSET_CLEANUP_DRY_RUN !== 'false',
} = {}) => {
    const bucket = getRichTextBucket();
    if (!bucket) {
        throw new Error('Rich text storage bucket is not configured');
    }

    const candidates = await findCleanupCandidates({ retentionDays, limit });
    const results = {
        dryRun,
        retentionDays,
        scanned: candidates.length,
        deleted: 0,
        skipped: 0,
        failed: 0,
        items: [],
    };

    for (const asset of candidates) {
        const referenceCount = await RichTextAssetReference.count({
            where: { rich_text_asset_id: asset.rich_text_asset_id },
        });

        if (referenceCount > 0) {
            await RichTextAsset.update({
                status: STATUS_REFERENCED,
                orphaned_time: null,
                updated_time: now(),
            }, {
                where: { rich_text_asset_id: asset.rich_text_asset_id },
            });
            results.skipped += 1;
            results.items.push({
                rich_text_asset_id: asset.rich_text_asset_id,
                object_key: asset.object_key,
                action: 'skip_referenced',
            });
            continue;
        }

        if (dryRun) {
            results.skipped += 1;
            results.items.push({
                rich_text_asset_id: asset.rich_text_asset_id,
                object_key: asset.object_key,
                action: 'dry_run',
            });
            continue;
        }

        try {
            await storage.deleteFile(RICHTEXT_STORAGE_SCOPE, {
                provider: asset.storage_provider,
                bucket,
                objectName: asset.object_key,
            });
            await RichTextAsset.destroy({
                where: { rich_text_asset_id: asset.rich_text_asset_id },
            });
            results.deleted += 1;
            results.items.push({
                rich_text_asset_id: asset.rich_text_asset_id,
                object_key: asset.object_key,
                action: 'deleted',
            });
        } catch (error) {
            results.failed += 1;
            results.items.push({
                rich_text_asset_id: asset.rich_text_asset_id,
                object_key: asset.object_key,
                action: 'failed',
                error: error.message,
            });
        }
    }

    return results;
};

module.exports = {
    STATUS_UPLOADED,
    STATUS_REFERENCED,
    STATUS_ORPHANED,
    extractImageSources,
    resolveManagedRichTextSource,
    ensureManagedAssetsForSources,
    recordUploadedRichTextAsset,
    syncRichTextAssetReferences,
    cleanupRichTextAssets,
};
