require('dotenv').config();
const sequelize = require('../config/db');
const { cleanupRichTextAssets } = require('../services/richTextAssetService');

const parseArgs = () => {
    const options = {};

    for (const arg of process.argv.slice(2)) {
        if (arg === '--delete') {
            options.dryRun = false;
            continue;
        }

        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }

        const [key, value] = arg.split('=');
        if (key === '--retention-days') {
            options.retentionDays = Number.parseInt(value, 10);
        }
        if (key === '--limit') {
            options.limit = Number.parseInt(value, 10);
        }
    }

    return options;
};

(async () => {
    const result = await cleanupRichTextAssets(parseArgs());
    console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(async () => {
    await sequelize.close();
});
