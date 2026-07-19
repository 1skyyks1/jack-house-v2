const router = require('./router');
const { startSynchronizer } = require('./service');
const { cleanupStaleFiles } = require('./tempFiles');
const { tempDirectory } = require('./upload');

let cleanupTimer = null;

const start = () => {
    cleanupStaleFiles(tempDirectory)
        .catch((error) => console.error('AI image temp cleanup failed:', error));

    if (!cleanupTimer) {
        cleanupTimer = setInterval(() => {
            cleanupStaleFiles(tempDirectory)
                .catch((error) => console.error('AI image temp cleanup failed:', error));
        }, 15 * 60 * 1000);
        cleanupTimer.unref?.();
    }

    startSynchronizer();
};

module.exports = {
    router,
    start,
};
