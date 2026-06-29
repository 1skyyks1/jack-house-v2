require('dotenv').config();
const { Op } = require('sequelize');
const sequelize = require('../config/db');
const { Event, PostTranslation } = require('../models');
const { TSection } = require('../models/tournament');
const { syncRichTextAssetReferences } = require('../services/richTextAssetService');

const DEFAULT_BATCH_SIZE = 100;

const toPositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseArgs = () => {
    const options = {
        dryRun: process.env.RICHTEXT_ASSET_BACKFILL_DRY_RUN !== 'false',
        batchSize: toPositiveInt(process.env.RICHTEXT_ASSET_BACKFILL_BATCH_SIZE, DEFAULT_BATCH_SIZE),
    };

    for (const arg of process.argv.slice(2)) {
        if (arg === '--apply') {
            options.dryRun = false;
            continue;
        }

        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }

        const [key, value] = arg.split('=');
        if (key === '--batch-size') {
            options.batchSize = toPositiveInt(value, options.batchSize);
        }
    }

    return options;
};

const scanContentModel = async ({
    model,
    contentType,
    idField,
    htmlField,
    batchSize,
    dryRun,
}) => {
    let offset = 0;
    const stats = {
        contentType,
        scanned: 0,
        withImages: 0,
        references: 0,
        orphaned: 0,
        assetsCreated: 0,
        assetsMatched: 0,
        sourcesSkipped: 0,
    };

    while (true) {
        const rows = await model.findAll({
            attributes: [idField, htmlField],
            where: {
                [htmlField]: {
                    [Op.like]: '%<img%',
                },
            },
            order: [[idField, 'ASC']],
            limit: batchSize,
            offset,
        });

        if (!rows.length) {
            break;
        }

        for (const row of rows) {
            const raw = row.toJSON();
            stats.scanned += 1;
            const result = await syncRichTextAssetReferences({
                contentType,
                contentId: raw[idField],
                html: raw[htmlField],
                createMissingAssets: true,
                dryRun,
            });
            const referenceCount = dryRun ? result.referenced + result.assetsCreated : result.referenced;

            if (referenceCount > 0 || result.sourcesSkipped > 0) {
                stats.withImages += 1;
            }
            stats.references += referenceCount;
            stats.orphaned += result.orphaned;
            stats.assetsCreated += result.assetsCreated;
            stats.assetsMatched += result.assetsMatched;
            stats.sourcesSkipped += result.sourcesSkipped;
        }

        offset += rows.length;
    }

    return stats;
};

(async () => {
    const options = parseArgs();
    const targets = [
        {
            model: PostTranslation,
            contentType: 'post_translation',
            idField: 'post_translation_id',
            htmlField: 'content',
        },
        {
            model: Event,
            contentType: 'event',
            idField: 'id',
            htmlField: 'desc',
        },
        {
            model: TSection,
            contentType: 't_section',
            idField: 'id',
            htmlField: 'content_html',
        },
    ];

    const results = [];
    for (const target of targets) {
        results.push(await scanContentModel({
            ...target,
            batchSize: options.batchSize,
            dryRun: options.dryRun,
        }));
    }

    console.log(JSON.stringify({
        dryRun: options.dryRun,
        batchSize: options.batchSize,
        results,
        note: options.dryRun ? 'dry-run only; pass --apply to write assets and references' : 'backfill applied',
    }, null, 2));
})().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(async () => {
    await sequelize.close();
});
